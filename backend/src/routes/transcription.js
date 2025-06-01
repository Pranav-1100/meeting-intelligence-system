const express = require('express');
const { getDb } = require('../database/init');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const openaiService = require('../services/openai');
const assemblyaiService = require('../services/assemblyai');

const router = express.Router();

/**
 * GET /api/transcription/:meetingId
 * Get transcript for a specific meeting
 */
router.get('/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { includeWordTimestamps = false, includeSegments = false } = req.query;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get main transcript
  const transcript = db.prepare(`
    SELECT * FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript) {
    throw new NotFoundError('Transcript');
  }

  let result = {
    ...transcript,
    word_timestamps: includeWordTimestamps && transcript.word_timestamps ? 
      JSON.parse(transcript.word_timestamps) : undefined
  };

  // Include segments if requested
  if (includeSegments === 'true') {
    const segments = db.prepare(`
      SELECT 
        ts.*,
        s.label as speaker_label,
        s.identified_name as speaker_name
      FROM transcript_segments ts
      LEFT JOIN speakers s ON ts.speaker_id = s.id
      WHERE ts.transcript_id = ?
      ORDER BY ts.start_time ASC
    `).all(transcript.id);

    result.segments = segments.map(segment => ({
      ...segment,
      word_timestamps: segment.word_timestamps ? JSON.parse(segment.word_timestamps) : []
    }));
  }

  res.json(result);
}));

/**
 * GET /api/transcription/:meetingId/segments
 * Get transcript segments with speaker information
 */
router.get('/:meetingId/segments', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { 
    startTime, 
    endTime, 
    speakerId,
    page = 1,
    limit = 50 
  } = req.query;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript ID
  const transcript = db.prepare(`
    SELECT id FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript) {
    throw new NotFoundError('Transcript');
  }

  // Build query with filters
  let whereConditions = ['ts.transcript_id = ?'];
  let queryParams = [transcript.id];

  if (startTime) {
    whereConditions.push('ts.start_time >= ?');
    queryParams.push(parseFloat(startTime));
  }

  if (endTime) {
    whereConditions.push('ts.end_time <= ?');
    queryParams.push(parseFloat(endTime));
  }

  if (speakerId) {
    whereConditions.push('ts.speaker_id = ?');
    queryParams.push(speakerId);
  }

  const whereClause = whereConditions.join(' AND ');
  const offset = (page - 1) * limit;

  // Get segments
  const segments = db.prepare(`
    SELECT 
      ts.*,
      s.label as speaker_label,
      s.identified_name as speaker_name,
      s.voice_profile as speaker_profile
    FROM transcript_segments ts
    LEFT JOIN speakers s ON ts.speaker_id = s.id
    WHERE ${whereClause}
    ORDER BY ts.start_time ASC
    LIMIT ? OFFSET ?
  `).all([...queryParams, parseInt(limit), offset]);

  // Get total count
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM transcript_segments ts
    WHERE ${whereClause}
  `).get(queryParams).count;

  res.json({
    segments: segments.map(segment => ({
      ...segment,
      word_timestamps: segment.word_timestamps ? JSON.parse(segment.word_timestamps) : [],
      speaker_profile: segment.speaker_profile ? JSON.parse(segment.speaker_profile) : {}
    })),
    pagination: {
      current_page: parseInt(page),
      total_pages: Math.ceil(totalCount / limit),
      total_items: totalCount,
      items_per_page: parseInt(limit)
    }
  });
}));

/**
 * GET /api/transcription/:meetingId/search
 * Search within transcript content
 */
router.get('/:meetingId/search', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { 
    query, 
    speakerId,
    caseSensitive = false,
    wholeWords = false,
    page = 1,
    limit = 20 
  } = req.query;

  if (!query || query.trim().length === 0) {
    throw new ValidationError('Search query is required');
  }

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript ID
  const transcript = db.prepare(`
    SELECT id FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript) {
    throw new NotFoundError('Transcript');
  }

  // Build search query
  let searchPattern = query.trim();
  if (!caseSensitive) {
    searchPattern = searchPattern.toLowerCase();
  }

  if (wholeWords) {
    searchPattern = `\\b${searchPattern}\\b`;
  }

  let whereConditions = ['ts.transcript_id = ?'];
  let queryParams = [transcript.id];

  // Add content search
  if (caseSensitive === 'true') {
    whereConditions.push('ts.content LIKE ?');
    queryParams.push(`%${searchPattern}%`);
  } else {
    whereConditions.push('LOWER(ts.content) LIKE ?');
    queryParams.push(`%${searchPattern}%`);
  }

  if (speakerId) {
    whereConditions.push('ts.speaker_id = ?');
    queryParams.push(speakerId);
  }

  const whereClause = whereConditions.join(' AND ');
  const offset = (page - 1) * limit;

  // Search segments
  const results = db.prepare(`
    SELECT 
      ts.*,
      s.label as speaker_label,
      s.identified_name as speaker_name
    FROM transcript_segments ts
    LEFT JOIN speakers s ON ts.speaker_id = s.id
    WHERE ${whereClause}
    ORDER BY ts.start_time ASC
    LIMIT ? OFFSET ?
  `).all([...queryParams, parseInt(limit), offset]);

  // Get total count
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM transcript_segments ts
    WHERE ${whereClause}
  `).get(queryParams).count;

  // Highlight search terms in results
  const highlightedResults = results.map(result => ({
    ...result,
    content: highlightSearchTerms(result.content, query, caseSensitive === 'true'),
    word_timestamps: result.word_timestamps ? JSON.parse(result.word_timestamps) : []
  }));

  res.json({
    query: query,
    results: highlightedResults,
    pagination: {
      current_page: parseInt(page),
      total_pages: Math.ceil(totalCount / limit),
      total_items: totalCount,
      items_per_page: parseInt(limit)
    }
  });
}));

/**
 * POST /api/transcription/:meetingId/correct
 * Correct transcript content
 */
router.post('/:meetingId/correct', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { segmentId, correctedContent, speakerCorrection } = req.body;

  if (!segmentId || !correctedContent) {
    throw new ValidationError('Segment ID and corrected content are required');
  }

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript and segment
  const transcript = db.prepare(`
    SELECT id FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript) {
    throw new NotFoundError('Transcript');
  }

  const segment = db.prepare(`
    SELECT * FROM transcript_segments WHERE id = ? AND transcript_id = ?
  `).get(segmentId, transcript.id);

  if (!segment) {
    throw new NotFoundError('Transcript segment');
  }

  // Update segment content
  db.prepare(`
    UPDATE transcript_segments 
    SET content = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(correctedContent.trim(), segmentId);

  // Update speaker if provided
  if (speakerCorrection) {
    const { speakerId, speakerName } = speakerCorrection;
    
    if (speakerId) {
      db.prepare(`
        UPDATE transcript_segments SET speaker_id = ? WHERE id = ?
      `).run(speakerId, segmentId);
    }

    if (speakerName && speakerId) {
      db.prepare(`
        UPDATE speakers SET identified_name = ? WHERE id = ?
      `).run(speakerName, speakerId);
    }
  }

  // Regenerate full transcript
  const allSegments = db.prepare(`
    SELECT content FROM transcript_segments 
    WHERE transcript_id = ? 
    ORDER BY start_time ASC
  `).all(transcript.id);

  const fullTranscript = allSegments.map(s => s.content).join(' ');
  const wordCount = fullTranscript.split(/\s+/).length;

  db.prepare(`
    UPDATE transcripts 
    SET content = ?, word_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fullTranscript, wordCount, transcript.id);

  res.json({
    message: 'Transcript corrected successfully',
    segmentId: segmentId,
    updatedContent: correctedContent
  });
}));

/**
 * POST /api/transcription/:meetingId/retranscribe
 * Re-transcribe audio with different settings
 */
router.post('/:meetingId/retranscribe', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { 
    language = 'en', 
    prompt,
    includeDiarization = true,
    temperature = 0 
  } = req.body;

  const db = getDb();

  // Verify meeting ownership and get audio file
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  if (!meeting.audio_file_path || !require('fs').existsSync(meeting.audio_file_path)) {
    throw new ValidationError('Audio file not found for re-transcription');
  }

  // Update processing status
  db.prepare(
    'UPDATE meetings SET processing_status = ?, processing_progress = 0 WHERE id = ?'
  ).run('processing', meetingId);

  try {
    // Re-transcribe with new settings
    console.log(`🔄 Re-transcribing meeting: ${meetingId}`);
    
    const transcriptionResult = await openaiService.transcribeAudio(meeting.audio_file_path, {
      language,
      prompt,
      temperature
    });

    // Update progress
    db.prepare(
      'UPDATE meetings SET processing_progress = ? WHERE id = ?'
    ).run(50, meetingId);

    // Get existing transcript ID or create new one
    let transcriptId = db.prepare(
      'SELECT id FROM transcripts WHERE meeting_id = ?'
    ).get(meetingId)?.id;

    if (transcriptId) {
      // Update existing transcript
      db.prepare(`
        UPDATE transcripts 
        SET content = ?, language = ?, confidence_score = ?, 
            word_count = ?, processing_time = ?, model_version = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        transcriptionResult.text,
        transcriptionResult.language,
        transcriptionResult.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / transcriptionResult.words.length,
        transcriptionResult.wordCount,
        transcriptionResult.processingTime,
        transcriptionResult.model,
        transcriptId
      );

      // Clear old segments
      db.prepare('DELETE FROM transcript_segments WHERE transcript_id = ?').run(transcriptId);
    } else {
      // Create new transcript
      transcriptId = require('uuid').v4();
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
    }

    // Re-run speaker diarization if requested
    if (includeDiarization && transcriptionResult.duration > 30) {
      try {
        const diarizationResult = await assemblyaiService.transcribeWithDiarization(meeting.audio_file_path, {
          language: language
        });

        // Update progress
        db.prepare(
          'UPDATE meetings SET processing_progress = ? WHERE id = ?'
        ).run(80, meetingId);

        // Clear old speakers
        db.prepare('DELETE FROM speakers WHERE meeting_id = ?').run(meetingId);

        // Add new speakers
        const speakerStmt = db.prepare(`
          INSERT INTO speakers (
            id, meeting_id, label, speaking_time, word_count, 
            confidence_score, voice_profile
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        diarizationResult.speakers.forEach(speaker => {
          speakerStmt.run(
            require('uuid').v4(),
            meetingId,
            speaker.label,
            speaker.totalSpeakingTime,
            speaker.totalWords,
            speaker.averageConfidence,
            JSON.stringify(speaker.sentiments || {})
          );
        });

      } catch (error) {
        console.warn('Speaker diarization failed during re-transcription:', error.message);
      }
    }

    // Mark as completed
    db.prepare(
      'UPDATE meetings SET processing_status = ?, processing_progress = 100 WHERE id = ?'
    ).run('completed', meetingId);

    res.json({
      message: 'Re-transcription completed successfully',
      meetingId: meetingId,
      transcript: {
        id: transcriptId,
        content: transcriptionResult.text,
        language: transcriptionResult.language,
        wordCount: transcriptionResult.wordCount,
        processingTime: transcriptionResult.processingTime
      }
    });

  } catch (error) {
    console.error('Re-transcription failed:', error);
    
    // Update status to failed
    db.prepare(
      'UPDATE meetings SET processing_status = ?, error_message = ? WHERE id = ?'
    ).run('failed', error.message, meetingId);
    
    throw error;
  }
}));

/**
 * GET /api/transcription/:meetingId/export
 * Export transcript in various formats
 */
router.get('/:meetingId/export', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { format = 'txt', includeSpeakers = true, includeTimestamps = false } = req.query;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  const transcript = db.prepare(`
    SELECT * FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript) {
    throw new NotFoundError('Transcript');
  }

  let exportData;
  let contentType;
  let filename;

  switch (format.toLowerCase()) {
    case 'json':
      exportData = await generateJSONExport(meetingId, includeSpeakers === 'true', includeTimestamps === 'true');
      contentType = 'application/json';
      filename = `meeting-${meetingId}-transcript.json`;
      break;

    case 'srt':
      exportData = await generateSRTExport(meetingId);
      contentType = 'text/plain';
      filename = `meeting-${meetingId}-transcript.srt`;
      break;

    case 'vtt':
      exportData = await generateVTTExport(meetingId);
      contentType = 'text/vtt';
      filename = `meeting-${meetingId}-transcript.vtt`;
      break;

    default: // txt
      exportData = await generateTextExport(meetingId, includeSpeakers === 'true', includeTimestamps === 'true');
      contentType = 'text/plain';
      filename = `meeting-${meetingId}-transcript.txt`;
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(exportData);
}));

/**
 * Helper functions for export formats
 */
async function generateTextExport(meetingId, includeSpeakers, includeTimestamps) {
  const db = getDb();
  
  if (includeSpeakers) {
    const segments = db.prepare(`
      SELECT 
        ts.content, ts.start_time, ts.end_time,
        COALESCE(s.identified_name, s.label, 'Unknown Speaker') as speaker_name
      FROM transcript_segments ts
      LEFT JOIN speakers s ON ts.speaker_id = s.id
      WHERE ts.transcript_id = (SELECT id FROM transcripts WHERE meeting_id = ?)
      ORDER BY ts.start_time ASC
    `).all(meetingId);

    return segments.map(segment => {
      let line = `${segment.speaker_name}: ${segment.content}`;
      if (includeTimestamps) {
        const startTime = formatTimestamp(segment.start_time);
        line = `[${startTime}] ${line}`;
      }
      return line;
    }).join('\n\n');
  } else {
    const transcript = db.prepare(`
      SELECT content FROM transcripts WHERE meeting_id = ?
    `).get(meetingId);
    
    return transcript?.content || '';
  }
}

async function generateJSONExport(meetingId, includeSpeakers, includeTimestamps) {
  const db = getDb();
  
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId);
  const transcript = db.prepare(`SELECT * FROM transcripts WHERE meeting_id = ?`).get(meetingId);
  
  let segments = [];
  let speakers = [];
  
  if (includeSpeakers) {
    segments = db.prepare(`
      SELECT 
        ts.*,
        COALESCE(s.identified_name, s.label) as speaker_name
      FROM transcript_segments ts
      LEFT JOIN speakers s ON ts.speaker_id = s.id
      WHERE ts.transcript_id = ?
      ORDER BY ts.start_time ASC
    `).all(transcript.id);

    speakers = db.prepare(`
      SELECT * FROM speakers WHERE meeting_id = ?
    `).all(meetingId);
  }

  return JSON.stringify({
    meeting: {
      id: meeting.id,
      title: meeting.title,
      duration: meeting.audio_duration,
      created_at: meeting.created_at
    },
    transcript: {
      content: transcript.content,
      language: transcript.language,
      word_count: transcript.word_count
    },
    ...(includeSpeakers && { speakers }),
    ...(includeTimestamps && { segments })
  }, null, 2);
}

async function generateSRTExport(meetingId) {
  const db = getDb();
  
  const segments = db.prepare(`
    SELECT 
      ts.content, ts.start_time, ts.end_time,
      COALESCE(s.identified_name, s.label, 'Speaker') as speaker_name
    FROM transcript_segments ts
    LEFT JOIN speakers s ON ts.speaker_id = s.id
    WHERE ts.transcript_id = (SELECT id FROM transcripts WHERE meeting_id = ?)
    ORDER BY ts.start_time ASC
  `).all(meetingId);

  return segments.map((segment, index) => {
    const startTime = formatSRTTimestamp(segment.start_time);
    const endTime = formatSRTTimestamp(segment.end_time);
    
    return `${index + 1}
${startTime} --> ${endTime}
${segment.speaker_name}: ${segment.content}`;
  }).join('\n\n');
}

async function generateVTTExport(meetingId) {
  const srtContent = await generateSRTExport(meetingId);
  return `WEBVTT\n\n${srtContent.replace(/(\d+)\n/g, '')}`;
}

function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatSRTTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function highlightSearchTerms(text, searchTerm, caseSensitive) {
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(`(${searchTerm})`, flags);
  return text.replace(regex, '<mark>$1</mark>');
}

module.exports = router;