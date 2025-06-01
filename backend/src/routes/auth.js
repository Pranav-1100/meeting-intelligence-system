const express = require('express');
const { getDb } = require('../database/init');
const { asyncHandler, ValidationError, UnauthorizedError } = require('../middleware/errorHandler');
const { authenticateFirebase } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/verify
 * Verify Firebase token and get/create user
 */
router.post('/verify', authenticateFirebase, asyncHandler(async (req, res) => {
  // User is already authenticated and stored in req.user by middleware
  const user = req.user;
  
  res.json({
    message: 'Authentication successful',
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      photo_url: user.photo_url,
      provider: user.provider,
      subscription_tier: user.subscription_tier,
      is_active: user.is_active,
      created_at: user.created_at,
      last_login: user.last_login,
      settings: user.settings ? JSON.parse(user.settings) : {}
    }
  });
}));

/**
 * GET /api/auth/profile
 * Get current user profile
 */
router.get('/profile', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const db = getDb();

  // Get user with additional statistics
  const user = db.prepare(`
    SELECT 
      u.*,
      COUNT(DISTINCT m.id) as total_meetings,
      COUNT(DISTINCT ai.id) as total_action_items,
      SUM(m.audio_duration) as total_audio_duration,
      COUNT(DISTINCT CASE WHEN m.created_at >= date('now', '-30 days') THEN m.id END) as meetings_last_30_days
    FROM users u
    LEFT JOIN meetings m ON u.id = m.user_id
    LEFT JOIN action_items ai ON m.id = ai.meeting_id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(userId);

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  res.json({
    user: {
      ...user,
      settings: user.settings ? JSON.parse(user.settings) : {},
      statistics: {
        total_meetings: user.total_meetings || 0,
        total_action_items: user.total_action_items || 0,
        total_audio_duration: user.total_audio_duration || 0,
        meetings_last_30_days: user.meetings_last_30_days || 0,
        average_meeting_duration: user.total_meetings > 0 ? 
          (user.total_audio_duration || 0) / user.total_meetings : 0
      }
    }
  });
}));

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    display_name, 
    settings 
  } = req.body;

  const db = getDb();

  // Build update query
  const updateFields = [];
  const updateValues = [];

  if (display_name !== undefined) {
    updateFields.push('display_name = ?');
    updateValues.push(display_name);
  }

  if (settings !== undefined) {
    // Validate settings object
    if (typeof settings !== 'object') {
      throw new ValidationError('Settings must be an object');
    }
    
    updateFields.push('settings = ?');
    updateValues.push(JSON.stringify(settings));
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  updateValues.push(userId);

  db.prepare(`
    UPDATE users 
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `).run(updateValues);

  // Get updated user
  const updatedUser = db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).get(userId);

  res.json({
    message: 'Profile updated successfully',
    user: {
      ...updatedUser,
      settings: updatedUser.settings ? JSON.parse(updatedUser.settings) : {}
    }
  });
}));

/**
 * GET /api/auth/settings
 * Get user settings
 */
router.get('/settings', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const db = getDb();

  const user = db.prepare(
    'SELECT settings FROM users WHERE id = ?'
  ).get(userId);

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const settings = user.settings ? JSON.parse(user.settings) : {
    notifications: true,
    theme: 'light',
    language: 'en',
    autoTranscription: true,
    realtimeProcessing: true,
    emailSummaries: false,
    slackNotifications: false
  };

  res.json({ settings });
}));

/**
 * PUT /api/auth/settings
 * Update user settings
 */
router.put('/settings', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const newSettings = req.body;

  if (!newSettings || typeof newSettings !== 'object') {
    throw new ValidationError('Settings object is required');
  }

  const db = getDb();

  // Get current settings
  const user = db.prepare(
    'SELECT settings FROM users WHERE id = ?'
  ).get(userId);

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const currentSettings = user.settings ? JSON.parse(user.settings) : {};
  const mergedSettings = { ...currentSettings, ...newSettings };

  // Update settings
  db.prepare(`
    UPDATE users 
    SET settings = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(mergedSettings), userId);

  res.json({
    message: 'Settings updated successfully',
    settings: mergedSettings
  });
}));

/**
 * GET /api/auth/usage
 * Get user usage statistics
 */
router.get('/usage', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period = '30' } = req.query; // days
  
  const db = getDb();

  // Calculate date range
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));
  const startDateStr = startDate.toISOString().split('T')[0];

  // Get usage statistics
  const usage = db.prepare(`
    SELECT 
      COUNT(DISTINCT m.id) as meetings_count,
      SUM(m.audio_duration) as total_audio_duration,
      COUNT(DISTINCT t.id) as transcripts_count,
      SUM(t.word_count) as total_words_transcribed,
      COUNT(DISTINCT ai.id) as action_items_count,
      COUNT(DISTINCT CASE WHEN m.meeting_type = 'real-time' THEN m.id END) as realtime_meetings,
      COUNT(DISTINCT CASE WHEN m.meeting_type = 'uploaded' THEN m.id END) as uploaded_meetings,
      AVG(m.audio_duration) as avg_meeting_duration
    FROM meetings m
    LEFT JOIN transcripts t ON m.id = t.meeting_id
    LEFT JOIN action_items ai ON m.id = ai.meeting_id
    WHERE m.user_id = ? AND DATE(m.created_at) >= ?
  `).get(userId, startDateStr);

  // Get daily breakdown
  const dailyUsage = db.prepare(`
    SELECT 
      DATE(m.created_at) as date,
      COUNT(m.id) as meetings_count,
      SUM(m.audio_duration) as audio_duration
    FROM meetings m
    WHERE m.user_id = ? AND DATE(m.created_at) >= ?
    GROUP BY DATE(m.created_at)
    ORDER BY date DESC
  `).all(userId, startDateStr);

  // Get processing status breakdown
  const processingStatus = db.prepare(`
    SELECT 
      processing_status,
      COUNT(*) as count
    FROM meetings
    WHERE user_id = ? AND DATE(created_at) >= ?
    GROUP BY processing_status
  `).all(userId, startDateStr);

  res.json({
    period: `${period} days`,
    usage: {
      meetings_count: usage.meetings_count || 0,
      total_audio_duration: usage.total_audio_duration || 0,
      transcripts_count: usage.transcripts_count || 0,
      total_words_transcribed: usage.total_words_transcribed || 0,
      action_items_count: usage.action_items_count || 0,
      realtime_meetings: usage.realtime_meetings || 0,
      uploaded_meetings: usage.uploaded_meetings || 0,
      avg_meeting_duration: usage.avg_meeting_duration || 0
    },
    daily_breakdown: dailyUsage,
    processing_status: processingStatus.reduce((acc, item) => {
      acc[item.processing_status] = item.count;
      return acc;
    }, {})
  });
}));

/**
 * DELETE /api/auth/account
 * Delete user account and all associated data
 */
router.delete('/account', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { confirmEmail } = req.body;

  // Verify email confirmation
  if (confirmEmail !== req.user.email) {
    throw new ValidationError('Email confirmation does not match');
  }

  const db = getDb();

  try {
    // Get all meetings to delete audio files
    const meetings = db.prepare(
      'SELECT audio_file_path FROM meetings WHERE user_id = ? AND audio_file_path IS NOT NULL'
    ).all(userId);

    // Delete audio files
    const fs = require('fs');
    meetings.forEach(meeting => {
      if (meeting.audio_file_path && fs.existsSync(meeting.audio_file_path)) {
        try {
          fs.unlinkSync(meeting.audio_file_path);
        } catch (error) {
          console.warn(`Failed to delete audio file: ${meeting.audio_file_path}`, error);
        }
      }
    });

    // Delete user (cascade will handle related records)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Account deletion error:', error);
    throw error;
  }
}));

/**
 * POST /api/auth/organizations
 * Create a new organization
 */
router.post('/organizations', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { name, description } = req.body;

  if (!name || name.trim().length === 0) {
    throw new ValidationError('Organization name is required');
  }

  const db = getDb();
  const orgId = require('uuid').v4();

  try {
    // Create organization
    db.prepare(`
      INSERT INTO organizations (id, name, description, owner_id)
      VALUES (?, ?, ?, ?)
    `).run(orgId, name.trim(), description || '', userId);

    // Add user as organization owner
    const membershipId = require('uuid').v4();
    db.prepare(`
      INSERT INTO user_organizations (id, user_id, organization_id, role)
      VALUES (?, ?, ?, ?)
    `).run(membershipId, userId, orgId, 'owner');

    const organization = db.prepare(
      'SELECT * FROM organizations WHERE id = ?'
    ).get(orgId);

    res.status(201).json({
      message: 'Organization created successfully',
      organization: {
        ...organization,
        settings: organization.settings ? JSON.parse(organization.settings) : {}
      }
    });

  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ValidationError('Organization name already exists');
    }
    throw error;
  }
}));

/**
 * GET /api/auth/organizations
 * Get user's organizations
 */
router.get('/organizations', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const db = getDb();

  const organizations = db.prepare(`
    SELECT 
      o.*,
      uo.role,
      uo.joined_at,
      COUNT(DISTINCT uo2.user_id) as member_count
    FROM organizations o
    JOIN user_organizations uo ON o.id = uo.organization_id
    LEFT JOIN user_organizations uo2 ON o.id = uo2.organization_id AND uo2.is_active = 1
    WHERE uo.user_id = ? AND uo.is_active = 1
    GROUP BY o.id
    ORDER BY uo.joined_at DESC
  `).all(userId);

  res.json({
    organizations: organizations.map(org => ({
      ...org,
      settings: org.settings ? JSON.parse(org.settings) : {}
    }))
  });
}));

/**
 * POST /api/auth/refresh
 * Refresh user session (mainly for updating last_login)
 */
router.post('/refresh', authenticateFirebase, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const db = getDb();

  // Update last login
  db.prepare(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(userId);

  res.json({
    message: 'Session refreshed successfully',
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;