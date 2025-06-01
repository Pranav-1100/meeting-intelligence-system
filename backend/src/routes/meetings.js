const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const openaiService = require('../services/openai');
const assemblyaiService = require('../services/assemblyai');

const router = express.Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.AUDIO_STORAGE_DIR || './data/audio';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.m4a', '.mp4', '.webm', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`Unsupported file type: ${ext}. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

/**
 * GET /api/meetings
 * Get user's meetings with pagination and filtering
 */
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    page = 1, 
    limit = 20, 
    status, 
    type, 
    search,
    startDate,
    endDate,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = req.query;

  const db = getDb();
  const offset = (page - 1) * limit;

  // Build query with filters
  let whereConditions = ['user_id = ?'];
  let queryParams = [userId];

  if (status) {
    whereConditions.push('status = ?');
    queryParams.push(status);
  }

  if (type) {
    whereConditions.push('meeting_type = ?');
    queryParams.push(type);
  }

  if (search) {
    whereConditions.push('(title LIKE ? OR description LIKE ?)');
    queryParams.push(`%${search}%`, `%${search}%`);
  }

  if (startDate) {
    whereConditions.push('created_at >= ?');
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push('created_at <= ?');
    queryParams.push(endDate);
  }

  const whereClause = whereConditions.join(' AND ');
  const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

  // Get meetings
  const meetings = db.prepare(`
    SELECT 
      m.*,
      COUNT(ai.id) as action_items_count,
      COUNT(mp.id) as participants_count
    FROM meetings m
    LEFT JOIN action_items ai ON m.id = ai.meeting_id
    LEFT JOIN meeting_participants mp ON m.id = mp.meeting_id
    WHERE ${whereClause}
    GROUP BY m.id
    ${orderClause}
    LIMIT ? OFFSET ?
  `).all([...queryParams, parseInt(limit), offset]);

  // Get total count
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count FROM meetings WHERE ${whereClause}
  `).get(queryParams).count;

  // Parse metadata for each meeting
  const formattedMeetings = meetings.map(meeting => ({
    ...meeting,
    metadata: meeting.metadata ? JSON.parse(meeting.metadata) : {},
    action_items_count: meeting.action_items_count || 0,
    participants_count: meeting.participants_count || 0
  }));

  res.json({
    meetings: formattedMeetings,
    pagination: {
      current_page: parseInt(page),
      total_pages: Math.ceil(totalCount / limit),
      total_items: totalCount,
      items_per_page: parseInt(limit)
    }
  });
}));

/**
 * GET /api/meetings/:id
 * Get specific meeting details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const db = getDb();
  
  // Get meeting details
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript
  const transcript = db.prepare(`
    SELECT * FROM transcripts WHERE meeting_id = ?
  `).get(id);

  // Get speakers
  const speakers = db.prepare(`
    SELECT * FROM speakers WHERE meeting_id = ? ORDER BY speaking_time DESC
  `).all(id);

  // Get action items
  const actionItems = db.prepare(`
    SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at DESC
  `).all(id);

  // Get participants
  const participants = db.prepare(`
    SELECT * FROM meeting_participants WHERE meeting_id = ?
  `).all(id);

  // Get analysis
  const analysis = db.prepare(`
    SELECT * FROM meeting_analysis WHERE meeting_id = ? ORDER BY created_at DESC
  `).all(id);

  res.json({
    meeting: {
      ...meeting,
      metadata: meeting.metadata ? JSON.parse(meeting.metadata) : {}
    },
    transcript: transcript ? {
      ...transcript,
      word_timestamps: transcript.word_timestamps ? JSON.parse(transcript.word_timestamps) : []
    } : null,
    speakers: speakers.map(speaker => ({
      ...speaker,
      voice_profile: speaker.voice_profile ? JSON.parse(speaker.voice_profile) : {}
    })),
    actionItems: actionItems.map(item => ({
      ...item,
      metadata: item.metadata ? JSON.parse(item.metadata) : {}
    })),
    participants,
    analysis: analysis.map(a => ({
      ...a,
      key_points: a.key_points ? JSON.parse(a.key_points) : [],
      decisions: a.decisions ? JSON.parse(a.decisions) : [],
      topics: a.topics ? JSON.parse(a.topics) : [],
      sentiment_analysis: a.sentiment_analysis ? JSON.parse(a.sentiment_analysis) : {}
    }))
  });
}));

/**
 * POST /api/meetings/upload
 * Upload and process audio file
 */
router.post('/upload', upload.single('audio'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('No audio file provided');
  }

  const userId = req.user.id;
  const { 
    title, 
    description, 
    meeting_type = 'uploaded',
    platform,
    participants = '[]',
    auto_process = 'true'
  } = req.body;

  const meetingId = uuidv4();
  const audioFilePath = req.file.path;
  const audioFileSize = req.file.size;

  try {
    // Create meeting record
    const db = getDb();
    const meeting = {
      id: meetingId,
      user_id: userId,
      title: title || `Meeting ${new Date().toLocaleDateString()}`,
      description: description || '',
      meeting_type: meeting_type,
      platform: platform || 'upload',
      audio_file_path: audioFilePath,
      audio_file_size: audioFileSize,
      status: 'uploaded',
      processing_status: auto_process === 'true' ? 'pending' : 'waiting',
      metadata: JSON.stringify({
        originalFilename: req.file.originalname,
        uploadedAt: new Date().toISOString()
      })
    };

    db.prepare(`
      INSERT INTO meetings (
        id, user_id, title, description, meeting_type, platform,
        audio_file_path, audio_file_size, status, processing_status, metadata
      ) VALUES (
        @id, @user_id, @title, @description, @meeting_type, @platform,
        @audio_file_path, @audio_file_size, @status, @processing_status, @metadata
      )
    `).run(meeting);

    // Add participants if provided
    const participantsList = JSON.parse(participants);
    if (participantsList.length > 0) {
      const participantStmt = db.prepare(`
        INSERT INTO meeting_participants (id, meeting_id, name, email, role)
        VALUES (?, ?, ?, ?, ?)
      `);

      participantsList.forEach(participant => {
        participantStmt.run(
          uuidv4(),
          meetingId,
          participant.name || '',
          participant.email || '',
          participant.role || 'participant'
        );
      });
    }

    // Start processing if auto_process is enabled
    if (auto_process === 'true') {
      // Process asynchronously
      processAudioFile(meetingId, audioFilePath, userId).catch(error => {
        console.error('Audio processing failed:', error);
        
        // Update meeting status
        db.prepare(
          'UPDATE meetings SET processing_status = ?, error_message = ? WHERE id = ?'
        ).run('failed', error.message, meetingId);
      });
    }

    res.status(201).json({
      message: 'Audio file uploaded successfully',
      meeting: {
        id: meetingId,
        title: meeting.title,
        status: meeting.status,
        processing_status: meeting.processing_status,
        audio_file_size: audioFileSize,
        auto_processing: auto_process === 'true'
      }
    });

  } catch (error) {
    // Clean up uploaded file if database operation fails
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
    throw error;
  }
}));

/**
 * POST /api/meetings/:id/process
 * Manually trigger processing for uploaded meeting
 */
router.post('/:id/process', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const db = getDb();
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  if (meeting.processing_status === 'processing') {
    throw new ValidationError('Meeting is already being processed');
  }

  if (meeting.processing_status === 'completed') {
    throw new ValidationError('Meeting has already been processed');
  }

  if (!meeting.audio_file_path || !fs.existsSync(meeting.audio_file_path)) {
    throw new ValidationError('Audio file not found');
  }

  // Update status to processing
  db.prepare(
    'UPDATE meetings SET processing_status = ?, processing_progress = 0 WHERE id = ?'
  ).run('processing', id);

  // Start processing
  processAudioFile(id, meeting.audio_file_path, userId).catch(error => {
    console.error('Audio processing failed:', error);
    
    db.prepare(
      'UPDATE meetings SET processing_status = ?, error_message = ? WHERE id = ?'
    ).run('failed', error.message, id);
  });

  res.json({
    message: 'Processing started',
    meeting_id: id,
    status: 'processing'
  });
}));

/**
 * GET /api/meetings/:id/status
 * Get processing status for a meeting
 */
router.get('/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const db = getDb();
  const meeting = db.prepare(`
    SELECT 
      id, processing_status, processing_progress, error_message,
      audio_duration, created_at, updated_at
    FROM meetings 
    WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  res.json({
    meeting_id: id,
    status: meeting.processing_status,
    progress: meeting.processing_progress || 0,
    error: meeting.error_message || null,
    duration: meeting.audio_duration || null,
    created_at: meeting.created_at,
    updated_at: meeting.updated_at
  });
}));

/**
 * DELETE /api/meetings/:id
 * Delete a meeting and all associated data
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const db = getDb();
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Delete audio file if exists
  if (meeting.audio_file_path && fs.existsSync(meeting.audio_file_path)) {
    fs.unlinkSync(meeting.audio_file_path);
  }

  // Delete meeting (cascade deletes will handle related records)
  db.prepare('DELETE FROM meetings WHERE id = ?').run(id);

  res.json({
    message: 'Meeting deleted successfully',
    meeting_id: id
  });
}));

/**
 * Enhanced debug endpoint for AssemblyAI testing
 * Add this to your routes/meetings.js
 */

router.post('/:id/debug-assemblyai', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const db = getDb();
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(id, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  try {
    console.log('🔧 DEBUG: Starting comprehensive AssemblyAI test...');
    
    // Check environment
    const envCheck = {
      assemblyai_key_present: !!process.env.ASSEMBLYAI_API_KEY,
      assemblyai_key_length: process.env.ASSEMBLYAI_API_KEY?.length || 0,
      assemblyai_key_preview: process.env.ASSEMBLYAI_API_KEY ? 
        process.env.ASSEMBLYAI_API_KEY.substring(0, 8) + '...' + process.env.ASSEMBLYAI_API_KEY.substring(process.env.ASSEMBLYAI_API_KEY.length - 4) : 
        'not set',
      audio_file_exists: meeting.audio_file_path ? fs.existsSync(meeting.audio_file_path) : false,
      audio_file_size: meeting.audio_file_path && fs.existsSync(meeting.audio_file_path) ? 
        fs.statSync(meeting.audio_file_path).size : 0
    };

    console.log('🔧 DEBUG: Environment check:', envCheck);

    let results = {
      environment_check: envCheck,
      api_key_test: null,
      upload_test: null,
      transcription_test: null,
      audio_file_test: null
    };

    // Test 1: API Key Authentication
    if (envCheck.assemblyai_key_present) {
      console.log('🔧 DEBUG: Testing API key authentication...');
      try {
        const axios = require('axios');
        const response = await axios.get('https://api.assemblyai.com/v2/transcript', {
          headers: {
            'authorization': process.env.ASSEMBLYAI_API_KEY
          }
        });
        
        results.api_key_test = {
          success: true,
          status: response.status,
          transcripts_count: response.data.transcripts?.length || 0
        };
        console.log('✅ API key test passed');
      } catch (error) {
        results.api_key_test = {
          success: false,
          status: error.response?.status,
          error: error.response?.data?.error || error.message
        };
        console.log('❌ API key test failed:', error.message);
      }
    }

    // Test 2: File Upload Test
    if (results.api_key_test?.success) {
      console.log('🔧 DEBUG: Testing file upload...');
      try {
        const axios = require('axios');
        const testData = Buffer.alloc(1024, 0); // 1KB test file
        
        const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', testData, {
          headers: {
            'authorization': process.env.ASSEMBLYAI_API_KEY,
            'content-type': 'application/octet-stream'
          }
        });
        
        results.upload_test = {
          success: true,
          status: uploadResponse.status,
          upload_url_received: !!uploadResponse.data.upload_url
        };
        console.log('✅ Upload test passed');

        // Test 3: Transcription Request
        if (uploadResponse.data.upload_url) {
          console.log('🔧 DEBUG: Testing transcription request...');
          try {
            const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
              audio_url: uploadResponse.data.upload_url,
              speaker_labels: true,
              speakers_expected: 2
            }, {
              headers: {
                'authorization': process.env.ASSEMBLYAI_API_KEY,
                'content-type': 'application/json'
              }
            });
            
            results.transcription_test = {
              success: true,
              status: transcriptResponse.status,
              transcript_id: transcriptResponse.data.id,
              initial_status: transcriptResponse.data.status
            };
            console.log('✅ Transcription request test passed');
          } catch (error) {
            results.transcription_test = {
              success: false,
              status: error.response?.status,
              error: error.response?.data?.error || error.message
            };
            console.log('❌ Transcription request test failed:', error.message);
          }
        }
      } catch (error) {
        results.upload_test = {
          success: false,
          status: error.response?.status,
          error: error.response?.data?.error || error.message
        };
        console.log('❌ Upload test failed:', error.message);
      }
    }

    // Test 4: Audio File Test
    if (meeting.audio_file_path && fs.existsSync(meeting.audio_file_path)) {
      console.log('🔧 DEBUG: Testing actual audio file...');
      try {
        const audioData = fs.readFileSync(meeting.audio_file_path);
        
        results.audio_file_test = {
          exists: true,
          readable: true,
          size: audioData.length,
          size_mb: Math.round(audioData.length / 1024 / 1024 * 100) / 100
        };

        // Try uploading the actual audio file if previous tests passed
        if (results.upload_test?.success) {
          console.log('🔧 DEBUG: Testing upload of actual audio file...');
          try {
            const axios = require('axios');
            const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioData, {
              headers: {
                'authorization': process.env.ASSEMBLYAI_API_KEY,
                'content-type': 'application/octet-stream'
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            });
            
            results.audio_file_test.upload_success = true;
            results.audio_file_test.upload_url = !!uploadResponse.data.upload_url;
            console.log('✅ Actual audio file upload test passed');
          } catch (error) {
            results.audio_file_test.upload_success = false;
            results.audio_file_test.upload_error = error.response?.data?.error || error.message;
            console.log('❌ Actual audio file upload test failed:', error.message);
          }
        }

      } catch (error) {
        results.audio_file_test = {
          exists: true,
          readable: false,
          error: error.message
        };
        console.log('❌ Audio file read test failed:', error.message);
      }
    } else {
      results.audio_file_test = {
        exists: false,
        path: meeting.audio_file_path
      };
    }

    // Generate recommendations
    const recommendations = [];
    if (!envCheck.assemblyai_key_present) {
      recommendations.push('❌ Set ASSEMBLYAI_API_KEY in your .env file');
    } else if (!results.api_key_test?.success) {
      recommendations.push('❌ Get a valid AssemblyAI API key from https://www.assemblyai.com/dashboard');
    } else if (!results.upload_test?.success) {
      recommendations.push('❌ AssemblyAI upload is failing - check API key permissions');
    } else if (!results.audio_file_test?.exists) {
      recommendations.push('❌ Audio file is missing - check file path');
    } else if (!results.audio_file_test?.readable) {
      recommendations.push('❌ Audio file cannot be read - check file permissions');
    } else if (results.audio_file_test?.upload_success === false) {
      recommendations.push('❌ Audio file upload failed - file might be corrupted or too large');
    } else {
      recommendations.push('✅ All tests passed! AssemblyAI should work correctly');
    }

    res.json({
      message: 'Comprehensive AssemblyAI debug completed',
      meeting_id: id,
      ...results,
      recommendations,
      next_steps: results.api_key_test?.success && results.upload_test?.success ? [
        'Try processing the meeting again with: POST /api/meetings/' + id + '/process',
        'Check real-time logs during processing for detailed error messages'
      ] : [
        'Fix the failed tests above before attempting to process audio',
        'Get a new AssemblyAI API key if authentication failed'
      ]
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * Async function to process audio file
 */
/**
 * Enhanced processAudioFile function with better diarization handling
 * Replace the existing processAudioFile function in your meetings.js
 */

/**
 * Updated processAudioFile function - AssemblyAI ONLY
 * Replace your existing processAudioFile function in meetings.js with this
 */

async function processAudioFile(meetingId, audioFilePath, userId) {
  const db = getDb();

  try {
    console.log(`🎵 Starting AssemblyAI-only audio processing for meeting: ${meetingId}`);
    console.log(`📁 Audio file path: ${audioFilePath}`);

    // Check if audio file exists
    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    // Get file stats
    const fileStats = fs.statSync(audioFilePath);
    console.log(`📊 File size: ${Math.round(fileStats.size / 1024 / 1024)}MB`);

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(10, meetingId);

    // Step 1: Complete transcription + diarization with AssemblyAI
    console.log('🎤 Starting AssemblyAI transcription with speaker diarization...');
    const transcriptionResult = await assemblyaiService.transcribeWithDiarization(audioFilePath, {
      minSpeakers: 1,
      maxSpeakers: 6,
      language: 'en',
      enableAutoHighlights: false, // Keep costs down
      enableSentimentAnalysis: false // Keep costs down
    });

    console.log(`✅ AssemblyAI transcription completed:`, {
      duration: transcriptionResult.duration,
      wordCount: transcriptionResult.wordCount,
      language: transcriptionResult.language,
      speakersFound: transcriptionResult.speakers?.length || 0,
      utterancesFound: transcriptionResult.utterances?.length || 0
    });

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ?, audio_duration = ? WHERE id = ?'
    ).run(60, transcriptionResult.duration, meetingId);

    // Step 2: Store transcript
    const transcriptId = uuidv4();
    const avgConfidence = transcriptionResult.words && transcriptionResult.words.length > 0 
      ? transcriptionResult.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / transcriptionResult.words.length
      : transcriptionResult.confidence || 0;

    db.prepare(`
      INSERT INTO transcripts (
        id, meeting_id, content, language, confidence_score, 
        word_count, processing_time, model_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transcriptId,
      meetingId,
      transcriptionResult.text,
      transcriptionResult.language,
      avgConfidence,
      transcriptionResult.wordCount,
      transcriptionResult.processingTime,
      transcriptionResult.model
    );

    console.log('💾 Transcript stored successfully');

    // Step 3: Store speakers (from AssemblyAI diarization)
    const speakerInfo = transcriptionResult.speakers || [];
    if (speakerInfo.length > 0) {
      console.log(`💾 Storing ${speakerInfo.length} speakers in database...`);
      
      const speakerStmt = db.prepare(`
        INSERT INTO speakers (
          id, meeting_id, label, speaking_time, word_count, 
          confidence_score, voice_profile
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      speakerInfo.forEach((speaker, index) => {
        const speakerId = uuidv4();
        console.log(`👤 Storing speaker: ${speaker.label}`, {
          speakingTime: speaker.totalSpeakingTime,
          wordCount: speaker.totalWords,
          confidence: speaker.averageConfidence
        });

        speakerStmt.run(
          speakerId,
          meetingId,
          speaker.label,
          speaker.totalSpeakingTime || 0,
          speaker.totalWords || 0,
          speaker.averageConfidence || 0,
          JSON.stringify({
            method: 'assemblyai',
            utteranceCount: speaker.utteranceCount || 0
          })
        );
      });

      console.log('✅ Speaker data stored successfully');
    } else {
      console.log('ℹ️ No speakers detected by AssemblyAI');
    }

    // Step 4: Store transcript segments with speaker labels (from AssemblyAI utterances)
    if (transcriptionResult.utterances && transcriptionResult.utterances.length > 0) {
      console.log(`💬 Storing ${transcriptionResult.utterances.length} transcript segments...`);
      
      const segmentStmt = db.prepare(`
        INSERT INTO transcript_segments (
          id, transcript_id, speaker_id, content, start_time, end_time,
          confidence_score, segment_index, is_final
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      transcriptionResult.utterances.forEach((utterance, index) => {
        // Find speaker ID by label
        const speakerDbRecord = speakerInfo.find(s => s.label === utterance.speaker);
        const speakerIdFromDb = speakerDbRecord ? db.prepare(
          'SELECT id FROM speakers WHERE meeting_id = ? AND label = ?'
        ).get(meetingId, utterance.speaker)?.id : null;

        segmentStmt.run(
          uuidv4(),
          transcriptId,
          speakerIdFromDb,
          utterance.text,
          utterance.start,
          utterance.end,
          utterance.confidence || 0,
          index,
          1
        );
      });

      console.log('✅ Transcript segments stored successfully');
    }

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(80, meetingId);

    // Step 5: Meeting Analysis with GPT-4 (using AssemblyAI transcript)
    console.log('🧠 Starting meeting analysis with GPT-4...');
    const analysisResult = await openaiService.analyzeMeeting(transcriptionResult.text, {
      analysisType: 'comprehensive',
      speakerInfo: speakerInfo,
      meetingContext: { 
        duration: transcriptionResult.duration,
        speakersDetected: speakerInfo.length,
        method: 'assemblyai-complete',
        utterances: transcriptionResult.utterances?.length || 0
      }
    });

    console.log('✅ Meeting analysis completed');

    // Store analysis
    const analysisId = uuidv4();
    db.prepare(`
      INSERT INTO meeting_analysis (
        id, meeting_id, analysis_type, summary, key_points, 
        decisions, topics, sentiment_analysis, confidence_score, 
        model_version, processing_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analysisId,
      meetingId,
      'comprehensive',
      analysisResult.summary,
      JSON.stringify(analysisResult.keyPoints || []),
      JSON.stringify(analysisResult.decisions || []),
      JSON.stringify(analysisResult.topics || []),
      JSON.stringify({
        ...analysisResult.sentiment || {},
        transcriptionMethod: 'assemblyai'
      }),
      analysisResult.metadata?.confidence || 0.8,
      analysisResult.metadata?.model,
      analysisResult.metadata?.processingTime
    );

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(90, meetingId);

    // Step 6: Extract Action Items
    if (analysisResult.actionItems && analysisResult.actionItems.length > 0) {
      console.log(`🎯 Storing ${analysisResult.actionItems.length} action items...`);
      
      const actionStmt = db.prepare(`
        INSERT INTO action_items (
          id, meeting_id, title, description, assignee_name, due_date,
          priority, category, confidence_score, extracted_from_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      analysisResult.actionItems.forEach(item => {
        actionStmt.run(
          uuidv4(),
          meetingId,
          item.title,
          item.description,
          item.assignee,
          item.dueDate,
          item.priority,
          item.category,
          item.confidenceScore || 0.7,
          item.extractedFromText
        );
      });

      console.log('✅ Action items stored successfully');
    }

    // Mark as completed
    db.prepare(
      'UPDATE meetings SET processing_status = ?, processing_progress = 100 WHERE id = ?'
    ).run('completed', meetingId);

    console.log(`✅ AssemblyAI-only audio processing completed for meeting: ${meetingId}`);
    console.log(`📊 Final stats:`, {
      duration: transcriptionResult.duration,
      speakers: speakerInfo.length,
      utterances: transcriptionResult.utterances?.length || 0,
      actionItems: analysisResult.actionItems?.length || 0,
      method: 'assemblyai-complete'
    });

  } catch (error) {
    console.error(`❌ AssemblyAI audio processing failed for meeting ${meetingId}:`, {
      error: error.message,
      stack: error.stack
    });
    
    db.prepare(
      'UPDATE meetings SET processing_status = ?, error_message = ? WHERE id = ?'
    ).run('failed', error.message, meetingId);
    
    throw error;
  }
}

module.exports = router;