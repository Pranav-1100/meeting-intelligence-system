const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const openaiService = require('../services/openai');

const router = express.Router();

/**
 * GET /api/analysis/:meetingId
 * Get all analysis results for a meeting
 */
router.get('/:meetingId', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get all analysis results
  const analysis = db.prepare(`
    SELECT * FROM meeting_analysis WHERE meeting_id = ? ORDER BY created_at DESC
  `).all(meetingId);

  // Parse JSON fields
  const formattedAnalysis = analysis.map(a => ({
    ...a,
    key_points: a.key_points ? JSON.parse(a.key_points) : [],
    decisions: a.decisions ? JSON.parse(a.decisions) : [],
    topics: a.topics ? JSON.parse(a.topics) : [],
    sentiment_analysis: a.sentiment_analysis ? JSON.parse(a.sentiment_analysis) : {}
  }));

  res.json({ analysis: formattedAnalysis });
}));

/**
 * POST /api/analysis/:meetingId/generate
 * Generate new analysis for a meeting
 */
router.post('/:meetingId/generate', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { 
    analysisType = 'comprehensive',
    customPrompt,
    includeActionItems = true 
  } = req.body;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript
  const transcript = db.prepare(`
    SELECT content FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript || !transcript.content) {
    throw new ValidationError('No transcript found for this meeting');
  }

  // Get speaker information
  const speakers = db.prepare(`
    SELECT * FROM speakers WHERE meeting_id = ?
  `).all(meetingId);

  const speakerInfo = speakers.map(s => ({
    label: s.label,
    name: s.identified_name,
    speakingTime: s.speaking_time,
    wordCount: s.word_count
  }));

  try {
    // Generate analysis
    const analysisResult = await openaiService.analyzeMeeting(transcript.content, {
      analysisType,
      speakerInfo,
      meetingContext: {
        title: meeting.title,
        type: meeting.meeting_type,
        duration: meeting.audio_duration
      },
      customPrompt
    });

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
      analysisType,
      analysisResult.summary,
      JSON.stringify(analysisResult.keyPoints || []),
      JSON.stringify(analysisResult.decisions || []),
      JSON.stringify(analysisResult.topics || []),
      JSON.stringify(analysisResult.sentiment || {}),
      analysisResult.metadata?.confidence || 0.8,
      analysisResult.metadata?.model,
      analysisResult.metadata?.processingTime
    );

    // Extract and store action items if requested
    if (includeActionItems && analysisResult.actionItems) {
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

    res.json({
      message: 'Analysis generated successfully',
      analysisId,
      analysis: {
        ...analysisResult,
        id: analysisId,
        created_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Analysis generation failed:', error);
    throw error;
  }
}));

/**
 * GET /api/analysis/:meetingId/action-items
 * Get action items for a meeting
 */
router.get('/:meetingId/action-items', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { 
    status, 
    priority, 
    assignee,
    page = 1,
    limit = 20 
  } = req.query;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Build query with filters
  let whereConditions = ['meeting_id = ?'];
  let queryParams = [meetingId];

  if (status) {
    whereConditions.push('status = ?');
    queryParams.push(status);
  }

  if (priority) {
    whereConditions.push('priority = ?');
    queryParams.push(priority);
  }

  if (assignee) {
    whereConditions.push('assignee_name LIKE ?');
    queryParams.push(`%${assignee}%`);
  }

  const whereClause = whereConditions.join(' AND ');
  const offset = (page - 1) * limit;

  // Get action items
  const actionItems = db.prepare(`
    SELECT * FROM action_items 
    WHERE ${whereClause}
    ORDER BY 
      CASE priority 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'low' THEN 3 
        ELSE 4 
      END,
      due_date ASC,
      created_at DESC
    LIMIT ? OFFSET ?
  `).all([...queryParams, parseInt(limit), offset]);

  // Get total count
  const totalCount = db.prepare(`
    SELECT COUNT(*) as count FROM action_items WHERE ${whereClause}
  `).get(queryParams).count;

  res.json({
    actionItems: actionItems.map(item => ({
      ...item,
      metadata: item.metadata ? JSON.parse(item.metadata) : {}
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
 * POST /api/analysis/:meetingId/action-items
 * Create a new action item
 */
router.post('/:meetingId/action-items', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const {
    title,
    description,
    assigneeName,
    assigneeId,
    dueDate,
    priority = 'medium',
    category = 'task'
  } = req.body;

  if (!title) {
    throw new ValidationError('Title is required for action items');
  }

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  const actionItemId = uuidv4();
  
  db.prepare(`
    INSERT INTO action_items (
      id, meeting_id, title, description, assignee_name, assignee_id,
      due_date, priority, category, status, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionItemId,
    meetingId,
    title,
    description,
    assigneeName,
    assigneeId,
    dueDate,
    priority,
    category,
    'pending',
    1.0 // Manual creation = high confidence
  );

  const newActionItem = db.prepare(
    'SELECT * FROM action_items WHERE id = ?'
  ).get(actionItemId);

  res.status(201).json({
    message: 'Action item created successfully',
    actionItem: newActionItem
  });
}));

/**
 * PUT /api/analysis/action-items/:actionItemId
 * Update an action item
 */
router.put('/action-items/:actionItemId', asyncHandler(async (req, res) => {
  const { actionItemId } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  const db = getDb();

  // Verify ownership through meeting
  const actionItem = db.prepare(`
    SELECT ai.*, m.user_id 
    FROM action_items ai
    JOIN meetings m ON ai.meeting_id = m.id
    WHERE ai.id = ? AND m.user_id = ?
  `).get(actionItemId, userId);

  if (!actionItem) {
    throw new NotFoundError('Action item');
  }

  // Build update query
  const allowedFields = [
    'title', 'description', 'assignee_name', 'assignee_id', 
    'due_date', 'priority', 'status', 'category'
  ];
  
  const updateFields = [];
  const updateValues = [];

  Object.keys(updates).forEach(field => {
    if (allowedFields.includes(field)) {
      updateFields.push(`${field} = ?`);
      updateValues.push(updates[field]);
    }
  });

  if (updateFields.length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  // Add completion timestamp if status changed to completed
  if (updates.status === 'completed' && actionItem.status !== 'completed') {
    updateFields.push('completed_at = CURRENT_TIMESTAMP');
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  updateValues.push(actionItemId);

  db.prepare(`
    UPDATE action_items 
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `).run(updateValues);

  const updatedActionItem = db.prepare(
    'SELECT * FROM action_items WHERE id = ?'
  ).get(actionItemId);

  res.json({
    message: 'Action item updated successfully',
    actionItem: updatedActionItem
  });
}));

/**
 * DELETE /api/analysis/action-items/:actionItemId
 * Delete an action item
 */
router.delete('/action-items/:actionItemId', asyncHandler(async (req, res) => {
  const { actionItemId } = req.params;
  const userId = req.user.id;

  const db = getDb();

  // Verify ownership through meeting
  const actionItem = db.prepare(`
    SELECT ai.id, m.user_id 
    FROM action_items ai
    JOIN meetings m ON ai.meeting_id = m.id
    WHERE ai.id = ? AND m.user_id = ?
  `).get(actionItemId, userId);

  if (!actionItem) {
    throw new NotFoundError('Action item');
  }

  db.prepare('DELETE FROM action_items WHERE id = ?').run(actionItemId);

  res.json({
    message: 'Action item deleted successfully',
    actionItemId
  });
}));

/**
 * GET /api/analysis/:meetingId/speakers
 * Get speaker analysis for a meeting
 */
router.get('/:meetingId/speakers', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get speakers with detailed statistics
  const speakers = db.prepare(`
    SELECT 
      s.*,
      COUNT(ts.id) as segment_count,
      AVG(ts.confidence_score) as avg_segment_confidence
    FROM speakers s
    LEFT JOIN transcript_segments ts ON s.id = ts.speaker_id
    WHERE s.meeting_id = ?
    GROUP BY s.id
    ORDER BY s.speaking_time DESC
  `).all(meetingId);

  // Calculate speaking percentages
  const totalSpeakingTime = speakers.reduce((sum, s) => sum + (s.speaking_time || 0), 0);

  const enrichedSpeakers = speakers.map(speaker => ({
    ...speaker,
    voice_profile: speaker.voice_profile ? JSON.parse(speaker.voice_profile) : {},
    speaking_percentage: totalSpeakingTime > 0 ? 
      ((speaker.speaking_time || 0) / totalSpeakingTime * 100).toFixed(1) : 0,
    words_per_minute: speaker.speaking_time > 0 ? 
      ((speaker.word_count || 0) / (speaker.speaking_time / 60)).toFixed(1) : 0
  }));

  res.json({
    speakers: enrichedSpeakers,
    summary: {
      total_speakers: speakers.length,
      total_speaking_time: totalSpeakingTime,
      most_active_speaker: enrichedSpeakers[0]?.label || null,
      average_confidence: speakers.reduce((sum, s) => sum + (s.confidence_score || 0), 0) / speakers.length
    }
  });
}));

/**
 * POST /api/analysis/:meetingId/speakers/:speakerId/identify
 * Identify a speaker with a name
 */
router.post('/:meetingId/speakers/:speakerId/identify', asyncHandler(async (req, res) => {
  const { meetingId, speakerId } = req.params;
  const userId = req.user.id;
  const { name, email } = req.body;

  if (!name) {
    throw new ValidationError('Speaker name is required');
  }

  const db = getDb();

  // Verify meeting ownership and speaker existence
  const speaker = db.prepare(`
    SELECT s.*, m.user_id 
    FROM speakers s
    JOIN meetings m ON s.meeting_id = m.id
    WHERE s.id = ? AND s.meeting_id = ? AND m.user_id = ?
  `).get(speakerId, meetingId, userId);

  if (!speaker) {
    throw new NotFoundError('Speaker');
  }

  // Update speaker identification
  db.prepare(`
    UPDATE speakers 
    SET identified_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, speakerId);

  // Try to link to existing participant
  if (email) {
    const participant = db.prepare(`
      SELECT id FROM meeting_participants 
      WHERE meeting_id = ? AND email = ?
    `).get(meetingId, email);

    if (participant) {
      db.prepare(`
        UPDATE speakers SET participant_id = ? WHERE id = ?
      `).run(participant.id, speakerId);
    }
  }

  const updatedSpeaker = db.prepare(`
    SELECT * FROM speakers WHERE id = ?
  `).get(speakerId);

  res.json({
    message: 'Speaker identified successfully',
    speaker: {
      ...updatedSpeaker,
      voice_profile: updatedSpeaker.voice_profile ? JSON.parse(updatedSpeaker.voice_profile) : {}
    }
  });
}));

/**
 * POST /api/analysis/:meetingId/regenerate-action-items
 * Regenerate action items for a meeting
 */
router.post('/:meetingId/regenerate-action-items', asyncHandler(async (req, res) => {
  const { meetingId } = req.params;
  const userId = req.user.id;
  const { prompt, includeExisting = false } = req.body;

  const db = getDb();

  // Verify meeting ownership
  const meeting = db.prepare(`
    SELECT id FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript
  const transcript = db.prepare(`
    SELECT content FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  if (!transcript || !transcript.content) {
    throw new ValidationError('No transcript found for this meeting');
  }

  // Get speaker information
  const speakers = db.prepare(`
    SELECT label, identified_name FROM speakers WHERE meeting_id = ?
  `).all(meetingId);

  try {
    // Extract action items
    const actionItems = await openaiService.extractActionItems(
      transcript.content,
      speakers.map(s => ({ label: s.label, name: s.identified_name }))
    );

    // Clear existing action items if not including them
    if (!includeExisting) {
      db.prepare('DELETE FROM action_items WHERE meeting_id = ?').run(meetingId);
    }

    // Store new action items
    const actionStmt = db.prepare(`
      INSERT INTO action_items (
        id, meeting_id, title, description, assignee_name, due_date,
        priority, category, confidence_score, extracted_from_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const newActionItems = [];
    actionItems.forEach(item => {
      const actionId = uuidv4();
      actionStmt.run(
        actionId,
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

      newActionItems.push({
        id: actionId,
        ...item
      });
    });

    res.json({
      message: 'Action items regenerated successfully',
      actionItems: newActionItems,
      count: newActionItems.length
    });

  } catch (error) {
    console.error('Action item regeneration failed:', error);
    throw error;
  }
}));

module.exports = router;