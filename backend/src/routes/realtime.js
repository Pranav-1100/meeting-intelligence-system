const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');

// In-memory storage for active recording sessions (replace with database in production)
const activeSessions = new Map();

// Start real-time recording session
router.post('/start-realtime', async (req, res) => {
  try {
    console.log('🎤 Starting real-time recording session...');
    console.log('Request body:', req.body);
    
    const { meeting, source } = req.body;
    
    if (!meeting || !meeting.id) {
      return res.status(400).json({ 
        error: 'Missing meeting data',
        message: 'Meeting object with id is required' 
      });
    }
    
    // Create session
    const session = {
      id: meeting.id,
      meetingId: meeting.id,
      title: meeting.title || 'Chrome Extension Recording',
      platform: meeting.platform || 'unknown',
      source: source || 'chrome-extension',
      startTime: Date.now(),
      status: 'active',
      chunksReceived: 0,
      totalSize: 0,
      audioChunks: [],
      transcript: '',
      actionItems: []
    };
    
    // Store session
    activeSessions.set(meeting.id, session);
    
    // Create temp directory for audio chunks
    const audioDir = path.join(__dirname, '../temp/audio', meeting.id);
    await fs.mkdir(audioDir, { recursive: true });
    
    console.log(`✅ Real-time session started: ${meeting.id}`);
    
    res.json({
      success: true,
      message: 'Real-time recording session started',
      session: {
        id: session.id,
        meetingId: session.meetingId,
        title: session.title,
        status: session.status,
        startTime: session.startTime
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start real-time session:', error);
    res.status(500).json({ 
      error: 'Failed to start recording session',
      message: error.message 
    });
  }
});

// Receive audio chunk from extension
router.post('/audio-chunk', async (req, res) => {
  try {
    const { meetingId, chunkIndex, audioData, timestamp, size } = req.body;
    
    if (!meetingId || !audioData) {
      return res.status(400).json({ 
        error: 'Missing required data',
        message: 'meetingId and audioData are required' 
      });
    }
    
    // Get session
    const session = activeSessions.get(meetingId);
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        message: 'Recording session not found. Please start recording first.' 
      });
    }
    
    console.log(`🎵 Received audio chunk ${chunkIndex} for meeting ${meetingId}:`, {
      size: size || 'unknown',
      timestamp: new Date(timestamp).toISOString()
    });
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Save chunk to file
    const audioDir = path.join(__dirname, '../temp/audio', meetingId);
    const chunkPath = path.join(audioDir, `chunk_${chunkIndex}.webm`);
    await fs.writeFile(chunkPath, audioBuffer);
    
    // Update session
    session.chunksReceived++;
    session.totalSize += audioBuffer.length;
    session.audioChunks.push({
      index: chunkIndex,
      timestamp,
      size: audioBuffer.length,
      path: chunkPath
    });
    
    // TODO: Process audio chunk with OpenAI Whisper
    // For now, simulate transcript processing
    const mockTranscript = `[Chunk ${chunkIndex}] Processing audio... `;
    session.transcript += mockTranscript;
    
    // TODO: Detect action items from transcript
    // For now, simulate action item detection
    if (chunkIndex % 3 === 0 && chunkIndex > 0) {
      const mockActionItem = {
        id: uuidv4(),
        title: `Action item detected in chunk ${chunkIndex}`,
        assignee: 'Unknown',
        timestamp: timestamp,
        confidence: 0.85
      };
      session.actionItems.push(mockActionItem);
    }
    
    console.log(`📊 Session ${meetingId} stats:`, {
      chunks: session.chunksReceived,
      totalSize: `${(session.totalSize / 1024 / 1024).toFixed(2)} MB`,
      transcript: `${session.transcript.length} chars`,
      actionItems: session.actionItems.length
    });
    
    res.json({
      success: true,
      message: 'Audio chunk processed',
      session: {
        meetingId: session.meetingId,
        chunksReceived: session.chunksReceived,
        transcriptLength: session.transcript.length,
        actionItemsCount: session.actionItems.length
      },
      // Send latest transcript and action items back to extension
      updates: {
        transcript: mockTranscript,
        actionItems: session.actionItems.slice(-1) // Latest action item
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to process audio chunk:', error);
    res.status(500).json({ 
      error: 'Failed to process audio chunk',
      message: error.message 
    });
  }
});

// Stop real-time recording session
router.post('/stop-realtime', async (req, res) => {
  try {
    const { meetingId } = req.body;
    
    if (!meetingId) {
      return res.status(400).json({ 
        error: 'Missing meetingId',
        message: 'meetingId is required' 
      });
    }
    
    // Get session
    const session = activeSessions.get(meetingId);
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        message: 'Recording session not found' 
      });
    }
    
    console.log(`🛑 Stopping real-time session: ${meetingId}`);
    
    // Update session status
    session.status = 'completed';
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    
    // TODO: Combine all audio chunks into final file
    // TODO: Generate final transcript and analysis
    // TODO: Save to database
    
    // For now, create a summary
    const summary = {
      meetingId: session.meetingId,
      title: session.title,
      platform: session.platform,
      duration: session.duration,
      chunksProcessed: session.chunksReceived,
      totalSize: session.totalSize,
      transcript: session.transcript,
      actionItems: session.actionItems,
      startTime: session.startTime,
      endTime: session.endTime
    };
    
    console.log(`✅ Session completed:`, {
      duration: `${(session.duration / 1000 / 60).toFixed(1)} minutes`,
      chunks: session.chunksReceived,
      size: `${(session.totalSize / 1024 / 1024).toFixed(2)} MB`
    });
    
    // Keep session for a while (for potential retrieval)
    setTimeout(() => {
      activeSessions.delete(meetingId);
      console.log(`🗑️  Cleaned up session: ${meetingId}`);
    }, 60000); // Keep for 1 minute
    
    res.json({
      success: true,
      message: 'Recording session completed',
      summary
    });
    
  } catch (error) {
    console.error('❌ Failed to stop real-time session:', error);
    res.status(500).json({ 
      error: 'Failed to stop recording session',
      message: error.message 
    });
  }
});

// Get session status
router.get('/session/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const session = activeSessions.get(meetingId);
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        message: 'Recording session not found' 
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session.id,
        meetingId: session.meetingId,
        title: session.title,
        status: session.status,
        startTime: session.startTime,
        chunksReceived: session.chunksReceived,
        totalSize: session.totalSize,
        transcriptLength: session.transcript.length,
        actionItemsCount: session.actionItems.length
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get session status:', error);
    res.status(500).json({ 
      error: 'Failed to get session status',
      message: error.message 
    });
  }
});

// Get live transcript for session
router.get('/transcript/:meetingId', (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const session = activeSessions.get(meetingId);
    if (!session) {
      return res.status(404).json({ 
        error: 'Session not found',
        message: 'Recording session not found' 
      });
    }
    
    res.json({
      success: true,
      transcript: session.transcript,
      actionItems: session.actionItems,
      lastUpdated: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Failed to get transcript:', error);
    res.status(500).json({ 
      error: 'Failed to get transcript',
      message: error.message 
    });
  }
});

// List active sessions
router.get('/sessions', (req, res) => {
  try {
    const sessions = Array.from(activeSessions.values()).map(session => ({
      id: session.id,
      meetingId: session.meetingId,
      title: session.title,
      status: session.status,
      startTime: session.startTime,
      chunksReceived: session.chunksReceived,
      source: session.source
    }));
    
    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
    
  } catch (error) {
    console.error('❌ Failed to get sessions:', error);
    res.status(500).json({ 
      error: 'Failed to get sessions',
      message: error.message 
    });
  }
});

module.exports = router;