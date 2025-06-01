const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { getDb } = require('../database/init');
const openaiService = require('./openai');
const assemblyaiService = require('./assemblyai');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class RealtimeAudioService {
  constructor() {
    this.activeSessions = new Map();
    this.chunkDuration = 90; // 90 seconds per chunk
    this.sampleRate = 16000;
    this.channels = 1;
    this.tempDir = path.join(__dirname, '../../temp');
    this.maxSessionDuration = 4 * 60 * 60; // 4 hours max
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Cleanup old sessions periodically
    setInterval(() => this.cleanupOldSessions(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Start a new real-time recording session
   */
  async startRecording(socket, data) {
    try {
      const { userId, meetingTitle, meetingType = 'real-time' } = data;
      const sessionId = uuidv4();
      const meetingId = uuidv4();

      console.log(`🔴 Starting real-time session: ${sessionId} for user: ${userId}`);

      // Create meeting record
      const db = getDb();
      const meeting = {
        id: meetingId,
        user_id: userId,
        title: meetingTitle || `Real-time Meeting ${new Date().toLocaleString()}`,
        meeting_type: meetingType,
        platform: 'chrome-extension',
        actual_start: new Date().toISOString(),
        status: 'in_progress',
        processing_status: 'live',
        metadata: JSON.stringify({
          isRealtime: true,
          sessionId: sessionId
        })
      };

      db.prepare(`
        INSERT INTO meetings (
          id, user_id, title, meeting_type, platform, actual_start, 
          status, processing_status, metadata
        ) VALUES (
          @id, @user_id, @title, @meeting_type, @platform, @actual_start,
          @status, @processing_status, @metadata
        )
      `).run(meeting);

      // Create realtime session record
      const session = {
        id: sessionId,
        socket_id: socket.id,
        user_id: userId,
        meeting_id: meetingId,
        status: 'active',
        chunks_processed: 0,
        total_duration: 0
      };

      db.prepare(`
        INSERT INTO realtime_sessions (
          id, socket_id, user_id, meeting_id, status, chunks_processed, total_duration
        ) VALUES (
          @id, @socket_id, @user_id, @meeting_id, @status, @chunks_processed, @total_duration
        )
      `).run(session);

      // Store session in memory
      this.activeSessions.set(socket.id, {
        sessionId,
        meetingId,
        userId,
        startTime: Date.now(),
        currentChunk: {
          index: 0,
          audioData: Buffer.alloc(0),
          startTime: Date.now()
        },
        audioBuffer: [],
        lastProcessedChunk: -1,
        isProcessing: false
      });

      // Initialize transcript
      const transcriptId = uuidv4();
      db.prepare(`
        INSERT INTO transcripts (id, meeting_id, content, language, confidence_score, word_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(transcriptId, meetingId, '', 'en', 0, 0);

      socket.emit('recording-started', {
        sessionId,
        meetingId,
        transcriptId,
        chunkDuration: this.chunkDuration
      });

      console.log(`✅ Real-time session started: ${sessionId}`);

    } catch (error) {
      console.error('Error starting recording:', error);
      socket.emit('recording-error', { 
        error: 'Failed to start recording session',
        details: error.message 
      });
    }
  }

  /**
   * Process incoming audio chunk
   */
  async processAudioChunk(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session) {
        socket.emit('error', { message: 'No active session found' });
        return;
      }

      const { audioData, timestamp } = data;
      const audioBuffer = Buffer.from(audioData);

      // Add to current chunk
      session.currentChunk.audioData = Buffer.concat([
        session.currentChunk.audioData,
        audioBuffer
      ]);

      const chunkDuration = (Date.now() - session.currentChunk.startTime) / 1000;

      // Check if chunk is ready for processing (90 seconds or forced)
      if (chunkDuration >= this.chunkDuration || data.forceProcess) {
        await this.processChunk(socket, session);
      }

      // Update last activity
      const db = getDb();
      db.prepare(
        'UPDATE realtime_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(session.sessionId);

    } catch (error) {
      console.error('Error processing audio chunk:', error);
      socket.emit('chunk-error', { 
        error: 'Failed to process audio chunk',
        details: error.message 
      });
    }
  }

  /**
   * Process a complete audio chunk
   */
  async processChunk(socket, session) {
    if (session.isProcessing || session.currentChunk.audioData.length === 0) {
      return;
    }

    session.isProcessing = true;
    const chunkIndex = session.currentChunk.index;

    try {
      console.log(`🎵 Processing chunk ${chunkIndex} for session ${session.sessionId}`);

      // Save chunk to temporary file
      const chunkPath = await this.saveAudioChunk(
        session.sessionId, 
        chunkIndex, 
        session.currentChunk.audioData
      );

      // Store chunk info in database
      const db = getDb();
      const chunkId = uuidv4();
      const chunkDuration = session.currentChunk.audioData.length / (this.sampleRate * 2); // 16-bit audio

      db.prepare(`
        INSERT INTO audio_chunks (
          id, session_id, chunk_index, file_path, duration, size
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(chunkId, session.sessionId, chunkIndex, chunkPath, chunkDuration, session.currentChunk.audioData.length);

      // Process chunk asynchronously
      this.processChunkAsync(socket, session, chunkId, chunkPath, chunkIndex);

      // Prepare next chunk
      session.currentChunk = {
        index: chunkIndex + 1,
        audioData: Buffer.alloc(0),
        startTime: Date.now()
      };

      session.isProcessing = false;

    } catch (error) {
      console.error(`Error processing chunk ${chunkIndex}:`, error);
      session.isProcessing = false;
      socket.emit('chunk-error', { 
        chunkIndex,
        error: 'Failed to process chunk',
        details: error.message 
      });
    }
  }

  /**
   * Process chunk asynchronously (transcription + analysis)
   */
  async processChunkAsync(socket, session, chunkId, chunkPath, chunkIndex) {
    try {
      // Convert to proper audio format if needed
      const processedPath = await this.convertAudio(chunkPath);

      // Transcribe chunk
      const transcriptionResult = await openaiService.transcribeAudio(processedPath, {
        language: 'en',
        prompt: 'This is a business meeting discussion.'
      });

      // Get speaker diarization (if audio is long enough)
      let speakerInfo = [];
      if (transcriptionResult.duration > 10) { // Only for chunks longer than 10 seconds
        try {
          const diarizationResult = await assemblyaiService.transcribeWithDiarization(processedPath, {
            minSpeakers: 2,
            maxSpeakers: 6
          });
          speakerInfo = diarizationResult.speakers;
        } catch (error) {
          console.warn('Speaker diarization failed for chunk:', error.message);
        }
      }

      // Extract action items from this chunk
      let actionItems = [];
      if (transcriptionResult.text.length > 50) {
        try {
          actionItems = await openaiService.extractActionItems(
            transcriptionResult.text, 
            speakerInfo
          );
        } catch (error) {
          console.warn('Action item extraction failed for chunk:', error.message);
        }
      }

      // Store transcript segment
      const db = getDb();
      const segmentId = uuidv4();
      const transcriptId = db.prepare(
        'SELECT id FROM transcripts WHERE meeting_id = ?'
      ).get(session.meetingId)?.id;

      if (transcriptId) {
        db.prepare(`
          INSERT INTO transcript_segments (
            id, transcript_id, content, start_time, end_time, 
            confidence_score, segment_index, is_final, word_timestamps
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          segmentId,
          transcriptId,
          transcriptionResult.text,
          chunkIndex * this.chunkDuration,
          (chunkIndex + 1) * this.chunkDuration,
          transcriptionResult.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / transcriptionResult.words.length,
          chunkIndex,
          1,
          JSON.stringify(transcriptionResult.words)
        );

        // Update main transcript
        const allSegments = db.prepare(
          'SELECT content FROM transcript_segments WHERE transcript_id = ? ORDER BY segment_index'
        ).all(transcriptId);

        const fullTranscript = allSegments.map(s => s.content).join(' ');
        const wordCount = fullTranscript.split(/\s+/).length;

        db.prepare(`
          UPDATE transcripts 
          SET content = ?, word_count = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(fullTranscript, wordCount, transcriptId);
      }

      // Store action items
      for (const actionItem of actionItems) {
        const actionId = uuidv4();
        db.prepare(`
          INSERT INTO action_items (
            id, meeting_id, title, description, assignee_name, due_date,
            priority, category, context_timestamp, confidence_score,
            extracted_from_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          actionId,
          session.meetingId,
          actionItem.title,
          actionItem.description,
          actionItem.assignee,
          actionItem.dueDate,
          actionItem.priority,
          actionItem.category,
          (chunkIndex * this.chunkDuration) + (actionItem.contextTimestamp || 0),
          actionItem.confidenceScore,
          actionItem.extractedFromText
        );
      }

      // Update session stats
      db.prepare(`
        UPDATE realtime_sessions 
        SET chunks_processed = chunks_processed + 1, 
            total_duration = total_duration + ?
        WHERE id = ?
      `).run(transcriptionResult.duration, session.sessionId);

      // Mark chunk as processed
      db.prepare(
        'UPDATE audio_chunks SET processed = 1, transcript_segment_id = ? WHERE id = ?'
      ).run(segmentId, chunkId);

      // Send real-time updates to client
      socket.emit('transcript-update', {
        chunkIndex,
        transcript: transcriptionResult.text,
        speakers: speakerInfo,
        actionItems: actionItems,
        confidence: transcriptionResult.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / transcriptionResult.words.length,
        processingTime: transcriptionResult.processingTime
      });

      console.log(`✅ Chunk ${chunkIndex} processed successfully`);

      // Cleanup temporary files
      setTimeout(() => {
        this.cleanupFiles([chunkPath, processedPath]);
      }, 60000); // Clean up after 1 minute

    } catch (error) {
      console.error(`Error in async chunk processing for chunk ${chunkIndex}:`, error);
      socket.emit('chunk-error', { 
        chunkIndex,
        error: 'Failed to process chunk content',
        details: error.message 
      });
    }
  }

  /**
   * Stop recording session
   */
  async stopRecording(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session) {
        socket.emit('error', { message: 'No active session found' });
        return;
      }

      console.log(`⏹️ Stopping real-time session: ${session.sessionId}`);

      // Process any remaining audio data
      if (session.currentChunk.audioData.length > 0) {
        await this.processChunk(socket, session);
      }

      // Update meeting and session status
      const db = getDb();
      const endTime = new Date().toISOString();
      const totalDuration = (Date.now() - session.startTime) / 1000;

      db.prepare(`
        UPDATE meetings 
        SET actual_end = ?, status = 'completed', processing_status = 'completed',
            audio_duration = ?
        WHERE id = ?
      `).run(endTime, totalDuration, session.meetingId);

      db.prepare(`
        UPDATE realtime_sessions 
        SET status = 'completed', total_duration = ?
        WHERE id = ?
      `).run(totalDuration, session.sessionId);

      // Generate final meeting analysis
      const transcript = db.prepare(
        'SELECT content FROM transcripts WHERE meeting_id = ?'
      ).get(session.meetingId);

      if (transcript && transcript.content.length > 100) {
        try {
          const finalAnalysis = await openaiService.analyzeMeeting(transcript.content, {
            analysisType: 'comprehensive',
            meetingContext: { 
              type: 'real-time', 
              duration: totalDuration,
              chunks: session.currentChunk.index
            }
          });

          // Store final analysis
          const analysisId = uuidv4();
          db.prepare(`
            INSERT INTO meeting_analysis (
              id, meeting_id, analysis_type, summary, key_points, 
              decisions, topics, sentiment_analysis, confidence_score, model_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            analysisId,
            session.meetingId,
            'comprehensive',
            finalAnalysis.summary,
            JSON.stringify(finalAnalysis.keyPoints),
            JSON.stringify(finalAnalysis.decisions),
            JSON.stringify(finalAnalysis.topics),
            JSON.stringify(finalAnalysis.sentiment),
            finalAnalysis.metadata?.confidence || 0.8,
            finalAnalysis.metadata?.model
          );

          socket.emit('final-analysis', {
            meetingId: session.meetingId,
            analysis: finalAnalysis
          });

        } catch (error) {
          console.warn('Final analysis failed:', error.message);
        }
      }

      // Clean up session
      this.activeSessions.delete(socket.id);

      socket.emit('recording-stopped', {
        sessionId: session.sessionId,
        meetingId: session.meetingId,
        totalDuration,
        chunksProcessed: session.currentChunk.index
      });

      console.log(`✅ Real-time session stopped: ${session.sessionId}`);

    } catch (error) {
      console.error('Error stopping recording:', error);
      socket.emit('error', { 
        error: 'Failed to stop recording session',
        details: error.message 
      });
    }
  }

  /**
   * Save audio chunk to temporary file
   */
  async saveAudioChunk(sessionId, chunkIndex, audioData) {
    const filename = `${sessionId}_chunk_${chunkIndex}.wav`;
    const filepath = path.join(this.tempDir, filename);

    // Create WAV header for raw audio data
    const header = this.createWavHeader(audioData.length, this.sampleRate, this.channels);
    const wavData = Buffer.concat([header, audioData]);

    fs.writeFileSync(filepath, wavData);
    return filepath;
  }

  /**
   * Convert audio to proper format for processing
   */
  async convertAudio(inputPath) {
    return new Promise((resolve, reject) => {
      const outputPath = inputPath.replace('.wav', '_processed.wav');

      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .format('wav')
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .save(outputPath);
    });
  }

  /**
   * Create WAV file header
   */
  createWavHeader(dataLength, sampleRate, channels) {
    const header = Buffer.alloc(44);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * 2, 28);
    header.writeUInt16LE(channels * 2, 32);
    header.writeUInt16LE(16, 34);
    
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    
    return header;
  }

  /**
   * Cleanup session when client disconnects
   */
  async cleanup(socketId) {
    const session = this.activeSessions.get(socketId);
    if (session) {
      console.log(`🧹 Cleaning up session: ${session.sessionId}`);
      
      // Mark session as disconnected
      const db = getDb();
      db.prepare(
        'UPDATE realtime_sessions SET status = ? WHERE id = ?'
      ).run('disconnected', session.sessionId);

      this.activeSessions.delete(socketId);
    }
  }

  /**
   * Cleanup old sessions and temporary files
   */
  cleanupOldSessions() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - maxAge;

    for (const [socketId, session] of this.activeSessions.entries()) {
      if (session.startTime < cutoff) {
        console.log(`🧹 Cleaning up old session: ${session.sessionId}`);
        this.cleanup(socketId);
      }
    }

    // Cleanup old temporary files
    this.cleanupOldTempFiles();
  }

  /**
   * Cleanup old temporary files
   */
  cleanupOldTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const maxAge = 2 * 60 * 60 * 1000; // 2 hours
      const cutoff = Date.now() - maxAge;

      files.forEach(file => {
        const filepath = path.join(this.tempDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtime.getTime() < cutoff) {
          fs.unlinkSync(filepath);
          console.log(`🗑️ Cleaned up old temp file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  /**
   * Cleanup specific files
   */
  cleanupFiles(filepaths) {
    filepaths.forEach(filepath => {
      try {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      } catch (error) {
        console.warn(`Failed to cleanup file ${filepath}:`, error.message);
      }
    });
  }
}

const handleRealtimeAudio = new RealtimeAudioService();

module.exports = {
  handleRealtimeAudio
};