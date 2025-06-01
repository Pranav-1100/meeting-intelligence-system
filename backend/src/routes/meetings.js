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
 * Async function to process audio file
 */
async function processAudioFile(meetingId, audioFilePath, userId) {
  const db = getDb();

  try {
    console.log(`🎵 Starting audio processing for meeting: ${meetingId}`);

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(10, meetingId);

    // Step 1: Transcription with OpenAI Whisper
    console.log('📝 Starting transcription...');
    const transcriptionResult = await openaiService.transcribeAudio(audioFilePath, {
      language: 'en'
    });

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ?, audio_duration = ? WHERE id = ?'
    ).run(40, transcriptionResult.duration, meetingId);

    // Store transcript
    const transcriptId = uuidv4();
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
      transcriptionResult.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / transcriptionResult.words.length,
      transcriptionResult.wordCount,
      transcriptionResult.processingTime,
      transcriptionResult.model
    );

    // Step 2: Speaker Diarization with AssemblyAI
    console.log('👥 Starting speaker diarization...');
    let speakerInfo = [];
    
    if (transcriptionResult.duration > 30) { // Only for longer recordings
      try {
        const diarizationResult = await assemblyaiService.transcribeWithDiarization(audioFilePath);
        speakerInfo = diarizationResult.speakers;

        // Update progress
        db.prepare(
          'UPDATE meetings SET processing_progress = ? WHERE id = ?'
        ).run(70, meetingId);

        // Store speakers
        const speakerStmt = db.prepare(`
          INSERT INTO speakers (
            id, meeting_id, label, speaking_time, word_count, 
            confidence_score, voice_profile
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        speakerInfo.forEach(speaker => {
          speakerStmt.run(
            uuidv4(),
            meetingId,
            speaker.label,
            speaker.totalSpeakingTime,
            speaker.totalWords,
            speaker.averageConfidence,
            JSON.stringify(speaker.sentiments || {})
          );
        });

      } catch (error) {
        console.warn('Speaker diarization failed:', error.message);
      }
    }

    // Step 3: Meeting Analysis with GPT-4
    console.log('🧠 Starting meeting analysis...');
    const analysisResult = await openaiService.analyzeMeeting(transcriptionResult.text, {
      analysisType: 'comprehensive',
      speakerInfo: speakerInfo,
      meetingContext: { duration: transcriptionResult.duration }
    });

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(90, meetingId);

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
      JSON.stringify(analysisResult.sentiment || {}),
      analysisResult.metadata?.confidence || 0.8,
      analysisResult.metadata?.model,
      analysisResult.metadata?.processingTime
    );

    // Step 4: Extract Action Items
    if (analysisResult.actionItems && analysisResult.actionItems.length > 0) {
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
    }

    // Mark as completed
    db.prepare(
      'UPDATE meetings SET processing_status = ?, processing_progress = 100 WHERE id = ?'
    ).run('completed', meetingId);

    console.log(`✅ Audio processing completed for meeting: ${meetingId}`);

  } catch (error) {
    console.error(`❌ Audio processing failed for meeting ${meetingId}:`, error);
    
    db.prepare(
      'UPDATE meetings SET processing_status = ?, error_message = ? WHERE id = ?'
    ).run('failed', error.message, meetingId);
    
    throw error;
  }
}

module.exports = router;