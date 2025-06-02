const fs = require('fs');
const path = require('path');

class RealtimeAudioService {
  constructor() {
    this.activeSessions = new Map();
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.audioDir = path.join(this.tempDir, 'audio');
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Start cleanup interval - every 30 minutes
    setInterval(() => {
      this.cleanupOldSessions();
    }, 30 * 60 * 1000);
    
    console.log('✅ RealtimeAudioService initialized');
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
      if (!fs.existsSync(this.audioDir)) {
        fs.mkdirSync(this.audioDir, { recursive: true });
      }
      console.log('📁 Temp directories ensured:', { tempDir: this.tempDir, audioDir: this.audioDir });
    } catch (error) {
      console.error('Failed to create temp directories:', error);
    }
  }

  cleanupOldSessions() {
    try {
      console.log('🧹 Starting cleanup of old sessions and temp files...');
      
      // Clean up expired sessions from memory
      const now = Date.now();
      let cleanedSessions = 0;
      
      for (const [sessionId, session] of this.activeSessions.entries()) {
        const sessionAge = now - session.startTime;
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        
        if (sessionAge > maxAge) {
          this.activeSessions.delete(sessionId);
          cleanedSessions++;
          console.log(`🗑️  Cleaned expired session: ${sessionId}`);
        }
      }
      
      // Clean up old temp files
      this.cleanupOldTempFiles();
      
      console.log(`✅ Cleanup completed. Removed ${cleanedSessions} expired sessions.`);
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  cleanupOldTempFiles() {
    try {
      if (!fs.existsSync(this.audioDir)) {
        console.log('📁 Audio directory does not exist, skipping file cleanup');
        return;
      }

      const files = fs.readdirSync(this.audioDir);
      const now = Date.now();
      let cleanedFiles = 0;

      files.forEach(filename => {
        try {
          const filePath = path.join(this.audioDir, filename);
          const stats = fs.statSync(filePath);
          
          // Only process files, not directories
          if (!stats.isFile()) {
            console.log(`⚠️  Skipping non-file item: ${filename}`);
            return;
          }

          const fileAge = now - stats.mtime.getTime();
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours

          if (fileAge > maxAge) {
            // Additional check to ensure file is not in use
            try {
              // Try to open the file to check if it's in use
              const fd = fs.openSync(filePath, 'r');
              fs.closeSync(fd);
              
              // If we can open it, it's safe to delete
              fs.unlinkSync(filePath);
              cleanedFiles++;
              console.log(`🗑️  Cleaned old temp file: ${filename}`);
              
            } catch (fileError) {
              if (fileError.code === 'EBUSY' || fileError.code === 'EPERM') {
                console.log(`⚠️  File in use, skipping: ${filename}`);
              } else {
                console.error(`Error processing file ${filename}:`, fileError.message);
              }
            }
          }
          
        } catch (statError) {
          console.error(`Error getting stats for ${filename}:`, statError.message);
        }
      });

      if (cleanedFiles > 0) {
        console.log(`✅ Cleaned ${cleanedFiles} old temp files`);
      }

    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  // Force cleanup specific file with better error handling
  cleanupFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.log(`⚠️  Cannot delete directory with unlink: ${filePath}`);
        return;
      }

      // Check if file is older than 5 minutes before forcing cleanup
      const fileAge = Date.now() - stats.mtime.getTime();
      if (fileAge > 5 * 60 * 1000) { // 5 minutes
        fs.unlinkSync(filePath);
        console.log(`🗑️  Force cleaned file: ${filePath}`);
      } else {
        console.log(`⏰ File too recent to cleanup: ${filePath}`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 File already deleted: ${filePath}`);
      } else if (error.code === 'EPERM' || error.code === 'EBUSY') {
        console.log(`🔒 File in use, will retry later: ${filePath}`);
      } else {
        console.error(`Error cleaning up file ${filePath}:`, error.message);
      }
    }
  }

  // Process audio chunk from extension
  async processAudioChunk(chunkData) {
    try {
      console.log(`🎵 Processing audio chunk ${chunkData.chunkIndex} for meeting ${chunkData.meetingId}`);
      
      // Validate chunk data
      if (!chunkData.audioData || !chunkData.meetingId) {
        throw new Error('Invalid chunk data: missing audioData or meetingId');
      }

      // Decode base64 audio
      const audioBuffer = Buffer.from(chunkData.audioData, 'base64');
      console.log(`📊 Decoded audio chunk: ${audioBuffer.length} bytes`);

      // Save chunk to temp file with unique name
      const timestamp = Date.now();
      const chunkFileName = `chunk_${chunkData.meetingId}_${chunkData.chunkIndex}_${timestamp}.webm`;
      const chunkFilePath = path.join(this.audioDir, chunkFileName);
      
      await fs.promises.writeFile(chunkFilePath, audioBuffer);
      console.log(`💾 Saved audio chunk: ${chunkFilePath}`);

      // Store chunk info in active sessions
      if (!this.activeSessions.has(chunkData.meetingId)) {
        this.activeSessions.set(chunkData.meetingId, {
          startTime: Date.now(),
          chunks: [],
          totalDuration: 0
        });
      }

      const session = this.activeSessions.get(chunkData.meetingId);
      session.chunks.push({
        index: chunkData.chunkIndex,
        filePath: chunkFilePath,
        size: audioBuffer.length,
        timestamp: chunkData.timestamp,
        processed: false
      });

      console.log(`📈 Session stats: ${session.chunks.length} chunks processed`);

      // TODO: Here you would integrate with your transcription service
      // For now, just return success
      return {
        success: true,
        chunkIndex: chunkData.chunkIndex,
        meetingId: chunkData.meetingId,
        message: 'Chunk processed successfully'
      };

    } catch (error) {
      console.error('❌ Failed to process audio chunk:', error);
      throw error;
    }
  }

  // Get session stats
  getSessionStats(meetingId) {
    const session = this.activeSessions.get(meetingId);
    if (!session) {
      return { exists: false };
    }

    return {
      exists: true,
      chunksCount: session.chunks.length,
      totalDuration: session.totalDuration,
      startTime: session.startTime,
      lastActivity: Date.now()
    };
  }

  // End session and cleanup
  async endSession(meetingId) {
    try {
      console.log(`🛑 Ending session for meeting: ${meetingId}`);
      
      const session = this.activeSessions.get(meetingId);
      if (!session) {
        console.log(`⚠️  No active session found for meeting: ${meetingId}`);
        return { success: false, message: 'No active session found' };
      }

      // Get session stats before cleanup
      const stats = {
        chunksProcessed: session.chunks.length,
        totalDuration: session.totalDuration,
        sessionDuration: Date.now() - session.startTime
      };

      // Schedule file cleanup after a delay (give time for any pending operations)
      setTimeout(() => {
        session.chunks.forEach(chunk => {
          this.cleanupFile(chunk.filePath);
        });
      }, 30000); // 30 seconds delay

      // Remove from active sessions
      this.activeSessions.delete(meetingId);

      console.log(`✅ Session ended successfully:`, stats);
      return { success: true, stats };

    } catch (error) {
      console.error('❌ Failed to end session:', error);
      throw error;
    }
  }
}

module.exports = new RealtimeAudioService();