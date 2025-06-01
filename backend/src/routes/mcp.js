const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');

// Import MCP services
const calendarService = require('../services/mcp/calendar');
const emailService = require('../services/mcp/email');
const slackService = require('../services/mcp/slack');
const notionService = require('../services/mcp/notion');

const router = express.Router();

/**
 * GET /api/mcp/integrations
 * Get user's MCP integrations
 */
router.get('/integrations', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const db = getDb();

  const integrations = db.prepare(`
    SELECT * FROM mcp_integrations 
    WHERE user_id = ? 
    ORDER BY service_type, created_at DESC
  `).all(userId);

  res.json({
    integrations: integrations.map(integration => ({
      ...integration,
      service_config: integration.service_config ? JSON.parse(integration.service_config) : {}
    }))
  });
}));

/**
 * POST /api/mcp/integrations
 * Create or update MCP integration
 */
router.post('/integrations', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { service_type, service_config, is_active = true } = req.body;

  if (!service_type || !service_config) {
    throw new ValidationError('Service type and configuration are required');
  }

  const allowedServices = ['calendar', 'email', 'slack', 'notion'];
  if (!allowedServices.includes(service_type)) {
    throw new ValidationError(`Invalid service type. Allowed: ${allowedServices.join(', ')}`);
  }

  const db = getDb();

  // Check if integration already exists
  const existingIntegration = db.prepare(
    'SELECT id FROM mcp_integrations WHERE user_id = ? AND service_type = ?'
  ).get(userId, service_type);

  let integrationId;

  if (existingIntegration) {
    // Update existing integration
    integrationId = existingIntegration.id;
    db.prepare(`
      UPDATE mcp_integrations 
      SET service_config = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(service_config), is_active, integrationId);
  } else {
    // Create new integration
    integrationId = uuidv4();
    db.prepare(`
      INSERT INTO mcp_integrations (id, user_id, service_type, service_config, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(integrationId, userId, service_type, JSON.stringify(service_config), is_active);
  }

  const integration = db.prepare(
    'SELECT * FROM mcp_integrations WHERE id = ?'
  ).get(integrationId);

  res.json({
    message: existingIntegration ? 'Integration updated successfully' : 'Integration created successfully',
    integration: {
      ...integration,
      service_config: integration.service_config ? JSON.parse(integration.service_config) : {}
    }
  });
}));

/**
 * DELETE /api/mcp/integrations/:integrationId
 * Delete MCP integration
 */
router.delete('/integrations/:integrationId', asyncHandler(async (req, res) => {
  const { integrationId } = req.params;
  const userId = req.user.id;

  const db = getDb();

  const integration = db.prepare(
    'SELECT * FROM mcp_integrations WHERE id = ? AND user_id = ?'
  ).get(integrationId, userId);

  if (!integration) {
    throw new NotFoundError('Integration');
  }

  db.prepare('DELETE FROM mcp_integrations WHERE id = ?').run(integrationId);

  res.json({
    message: 'Integration deleted successfully',
    integrationId
  });
}));

/**
 * POST /api/mcp/calendar/schedule-meeting
 * Schedule a meeting using calendar integration
 */
router.post('/calendar/schedule-meeting', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    title, 
    description, 
    start_time, 
    end_time, 
    attendees = [],
    meeting_id 
  } = req.body;

  if (!title || !start_time || !end_time) {
    throw new ValidationError('Title, start time, and end time are required');
  }

  // Get calendar integration
  const integration = await getActiveIntegration(userId, 'calendar');
  
  try {
    const result = await calendarService.scheduleMeeting(integration.service_config, {
      title,
      description,
      start_time,
      end_time,
      attendees
    });

    // Log automation
    await logAutomation(meeting_id, integration.id, 'schedule_meeting', {
      title,
      start_time,
      end_time,
      attendees
    }, 'completed', result);

    res.json({
      message: 'Meeting scheduled successfully',
      calendar_event: result
    });

  } catch (error) {
    await logAutomation(meeting_id, integration.id, 'schedule_meeting', {
      title,
      start_time,
      end_time,
      attendees
    }, 'failed', null, error.message);

    throw error;
  }
}));

/**
 * POST /api/mcp/email/send-summary
 * Send meeting summary via email
 */
router.post('/email/send-summary', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    meeting_id, 
    recipients, 
    subject, 
    include_transcript = false,
    include_action_items = true 
  } = req.body;

  if (!meeting_id || !recipients || recipients.length === 0) {
    throw new ValidationError('Meeting ID and recipients are required');
  }

  // Get email integration
  const integration = await getActiveIntegration(userId, 'email');

  // Get meeting data
  const meetingData = await getMeetingData(meeting_id, userId);

  try {
    const result = await emailService.sendMeetingSummary(integration.service_config, {
      meeting: meetingData.meeting,
      recipients,
      subject: subject || `Meeting Summary: ${meetingData.meeting.title}`,
      summary: meetingData.analysis[0]?.summary,
      actionItems: include_action_items ? meetingData.actionItems : [],
      transcript: include_transcript ? meetingData.transcript : null
    });

    // Log automation
    await logAutomation(meeting_id, integration.id, 'send_summary', {
      recipients,
      subject,
      include_transcript,
      include_action_items
    }, 'completed', result);

    res.json({
      message: 'Meeting summary sent successfully',
      email_result: result
    });

  } catch (error) {
    await logAutomation(meeting_id, integration.id, 'send_summary', {
      recipients,
      subject
    }, 'failed', null, error.message);

    throw error;
  }
}));

/**
 * POST /api/mcp/slack/post-summary
 * Post meeting summary to Slack
 */
router.post('/slack/post-summary', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    meeting_id, 
    channel, 
    include_action_items = true,
    mention_users = []
  } = req.body;

  if (!meeting_id || !channel) {
    throw new ValidationError('Meeting ID and channel are required');
  }

  // Get Slack integration
  const integration = await getActiveIntegration(userId, 'slack');

  // Get meeting data
  const meetingData = await getMeetingData(meeting_id, userId);

  try {
    const result = await slackService.postMeetingSummary(integration.service_config, {
      channel,
      meeting: meetingData.meeting,
      summary: meetingData.analysis[0]?.summary,
      actionItems: include_action_items ? meetingData.actionItems : [],
      mentionUsers: mention_users
    });

    // Log automation
    await logAutomation(meeting_id, integration.id, 'post_summary', {
      channel,
      include_action_items,
      mention_users
    }, 'completed', result);

    res.json({
      message: 'Meeting summary posted to Slack successfully',
      slack_result: result
    });

  } catch (error) {
    await logAutomation(meeting_id, integration.id, 'post_summary', {
      channel
    }, 'failed', null, error.message);

    throw error;
  }
}));

/**
 * POST /api/mcp/slack/create-action-items
 * Create Slack threads for action items
 */
router.post('/slack/create-action-items', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    meeting_id, 
    channel,
    action_item_ids = [] // If empty, create for all action items
  } = req.body;

  if (!meeting_id || !channel) {
    throw new ValidationError('Meeting ID and channel are required');
  }

  // Get Slack integration
  const integration = await getActiveIntegration(userId, 'slack');

  // Get meeting data
  const meetingData = await getMeetingData(meeting_id, userId);

  // Filter action items if specific IDs provided
  let actionItems = meetingData.actionItems;
  if (action_item_ids.length > 0) {
    actionItems = actionItems.filter(item => action_item_ids.includes(item.id));
  }

  try {
    const result = await slackService.createActionItemThreads(integration.service_config, {
      channel,
      meeting: meetingData.meeting,
      actionItems
    });

    // Log automation
    await logAutomation(meeting_id, integration.id, 'create_action_items', {
      channel,
      action_item_count: actionItems.length
    }, 'completed', result);

    res.json({
      message: 'Action item threads created successfully',
      slack_result: result
    });

  } catch (error) {
    await logAutomation(meeting_id, integration.id, 'create_action_items', {
      channel
    }, 'failed', null, error.message);

    throw error;
  }
}));

/**
 * POST /api/mcp/notion/create-meeting-page
 * Create Notion page for meeting
 */
router.post('/notion/create-meeting-page', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    meeting_id, 
    database_id, 
    template_type = 'standard',
    include_full_transcript = false 
  } = req.body;

  if (!meeting_id || !database_id) {
    throw new ValidationError('Meeting ID and database ID are required');
  }

  // Get Notion integration
  const integration = await getActiveIntegration(userId, 'notion');

  // Get meeting data
  const meetingData = await getMeetingData(meeting_id, userId);

  try {
    const result = await notionService.createMeetingPage(integration.service_config, {
      database_id,
      meeting: meetingData.meeting,
      summary: meetingData.analysis[0]?.summary,
      keyPoints: meetingData.analysis[0]?.key_points,
      decisions: meetingData.analysis[0]?.decisions,
      actionItems: meetingData.actionItems,
      speakers: meetingData.speakers,
      transcript: include_full_transcript ? meetingData.transcript : null,
      template_type
    });

    // Log automation
    await logAutomation(meeting_id, integration.id, 'create_meeting_page', {
      database_id,
      template_type,
      include_full_transcript
    }, 'completed', result);

    res.json({
      message: 'Notion meeting page created successfully',
      notion_result: result
    });

  } catch (error) {
    await logAutomation(meeting_id, integration.id, 'create_meeting_page', {
      database_id
    }, 'failed', null, error.message);

    throw error;
  }
}));

/**
 * GET /api/mcp/automation-logs/:meetingId
 * Get automation logs for a meeting
 */
router.get('/automation-logs/:meetingId', asyncHandler(async (req, res) => {
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

  const logs = db.prepare(`
    SELECT 
      mal.*,
      mi.service_type
    FROM mcp_automation_logs mal
    JOIN mcp_integrations mi ON mal.integration_id = mi.id
    WHERE mal.meeting_id = ?
    ORDER BY mal.created_at DESC
  `).all(meetingId);

  res.json({
    logs: logs.map(log => ({
      ...log,
      action_data: log.action_data ? JSON.parse(log.action_data) : {},
      result: log.result ? JSON.parse(log.result) : {}
    }))
  });
}));

/**
 * POST /api/mcp/test-integration/:serviceType
 * Test MCP integration
 */
router.post('/test-integration/:serviceType', asyncHandler(async (req, res) => {
  const { serviceType } = req.params;
  const userId = req.user.id;

  // Get integration
  const integration = await getActiveIntegration(userId, serviceType);

  let result;
  try {
    switch (serviceType) {
      case 'calendar':
        result = await calendarService.testConnection(integration.service_config);
        break;
      case 'email':
        result = await emailService.testConnection(integration.service_config);
        break;
      case 'slack':
        result = await slackService.testConnection(integration.service_config);
        break;
      case 'notion':
        result = await notionService.testConnection(integration.service_config);
        break;
      default:
        throw new ValidationError('Invalid service type');
    }

    res.json({
      message: 'Integration test successful',
      service_type: serviceType,
      test_result: result
    });

  } catch (error) {
    res.status(400).json({
      message: 'Integration test failed',
      service_type: serviceType,
      error: error.message
    });
  }
}));

/**
 * Helper functions
 */
async function getActiveIntegration(userId, serviceType) {
  const db = getDb();
  
  const integration = db.prepare(`
    SELECT * FROM mcp_integrations 
    WHERE user_id = ? AND service_type = ? AND is_active = 1
  `).get(userId, serviceType);

  if (!integration) {
    throw new ValidationError(`No active ${serviceType} integration found`);
  }

  return {
    ...integration,
    service_config: JSON.parse(integration.service_config)
  };
}

async function getMeetingData(meetingId, userId) {
  const db = getDb();

  // Get meeting
  const meeting = db.prepare(`
    SELECT * FROM meetings WHERE id = ? AND user_id = ?
  `).get(meetingId, userId);

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  // Get transcript
  const transcript = db.prepare(`
    SELECT * FROM transcripts WHERE meeting_id = ?
  `).get(meetingId);

  // Get speakers
  const speakers = db.prepare(`
    SELECT * FROM speakers WHERE meeting_id = ?
  `).all(meetingId);

  // Get action items
  const actionItems = db.prepare(`
    SELECT * FROM action_items WHERE meeting_id = ?
  `).all(meetingId);

  // Get analysis
  const analysis = db.prepare(`
    SELECT * FROM meeting_analysis WHERE meeting_id = ? ORDER BY created_at DESC
  `).all(meetingId);

  return {
    meeting: {
      ...meeting,
      metadata: meeting.metadata ? JSON.parse(meeting.metadata) : {}
    },
    transcript,
    speakers: speakers.map(s => ({
      ...s,
      voice_profile: s.voice_profile ? JSON.parse(s.voice_profile) : {}
    })),
    actionItems,
    analysis: analysis.map(a => ({
      ...a,
      key_points: a.key_points ? JSON.parse(a.key_points) : [],
      decisions: a.decisions ? JSON.parse(a.decisions) : [],
      topics: a.topics ? JSON.parse(a.topics) : [],
      sentiment_analysis: a.sentiment_analysis ? JSON.parse(a.sentiment_analysis) : {}
    }))
  };
}

async function logAutomation(meetingId, integrationId, actionType, actionData, status, result = null, errorMessage = null) {
  const db = getDb();
  
  const logId = uuidv4();
  db.prepare(`
    INSERT INTO mcp_automation_logs (
      id, meeting_id, integration_id, action_type, action_data, 
      status, result, error_message, executed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    logId,
    meetingId,
    integrationId,
    actionType,
    JSON.stringify(actionData),
    status,
    result ? JSON.stringify(result) : null,
    errorMessage,
    new Date().toISOString()
  );

  // Update integration usage count
  db.prepare(`
    UPDATE mcp_integrations 
    SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(integrationId);
}

module.exports = router;