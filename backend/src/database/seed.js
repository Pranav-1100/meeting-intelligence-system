const { getDb, initializeDatabase } = require('./init');
const { v4: uuidv4 } = require('uuid');

const sampleData = {
  users: [
    {
      id: 'user-1',
      firebase_uid: 'firebase-user-1',
      email: 'john.doe@example.com',
      display_name: 'John Doe',
      provider: 'email',
      subscription_tier: 'premium',
      settings: JSON.stringify({
        notifications: true,
        theme: 'light',
        language: 'en',
        autoTranscription: true,
        realtimeProcessing: true,
        emailSummaries: true,
        slackNotifications: false
      })
    },
    {
      id: 'user-2',
      firebase_uid: 'firebase-user-2',
      email: 'jane.smith@example.com',
      display_name: 'Jane Smith',
      provider: 'google',
      subscription_tier: 'free',
      settings: JSON.stringify({
        notifications: true,
        theme: 'dark',
        language: 'en',
        autoTranscription: true,
        realtimeProcessing: false,
        emailSummaries: false,
        slackNotifications: true
      })
    }
  ],

  organizations: [
    {
      id: 'org-1',
      name: 'TechCorp Inc',
      description: 'Leading technology company',
      owner_id: 'user-1',
      settings: JSON.stringify({
        defaultMeetingType: 'video-call',
        requireApproval: false,
        enableIntegrations: true
      })
    }
  ],

  userOrganizations: [
    {
      id: 'user-org-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      role: 'owner'
    },
    {
      id: 'user-org-2',
      user_id: 'user-2',
      organization_id: 'org-1',
      role: 'member'
    }
  ],

  meetings: [
    {
      id: 'meeting-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      title: 'Weekly Team Standup',
      description: 'Weekly team synchronization meeting',
      meeting_type: 'standup',
      platform: 'google-meet',
      scheduled_start: new Date('2024-01-15T09:00:00Z').toISOString(),
      scheduled_end: new Date('2024-01-15T09:30:00Z').toISOString(),
      actual_start: new Date('2024-01-15T09:02:00Z').toISOString(),
      actual_end: new Date('2024-01-15T09:28:00Z').toISOString(),
      status: 'completed',
      audio_duration: 1560, // 26 minutes
      processing_status: 'completed',
      processing_progress: 100,
      metadata: JSON.stringify({
        participants_count: 5,
        recording_quality: 'high',
        external_meeting_id: 'gm-abc123'
      })
    },
    {
      id: 'meeting-2',
      user_id: 'user-1',
      organization_id: 'org-1',
      title: 'Product Planning Session',
      description: 'Q1 product roadmap planning',
      meeting_type: 'planning',
      platform: 'zoom',
      scheduled_start: new Date('2024-01-16T14:00:00Z').toISOString(),
      scheduled_end: new Date('2024-01-16T15:30:00Z').toISOString(),
      actual_start: new Date('2024-01-16T14:05:00Z').toISOString(),
      actual_end: new Date('2024-01-16T15:35:00Z').toISOString(),
      status: 'completed',
      audio_duration: 5400, // 90 minutes
      processing_status: 'completed',
      processing_progress: 100,
      metadata: JSON.stringify({
        participants_count: 8,
        recording_quality: 'high',
        external_meeting_id: 'zoom-xyz789'
      })
    },
    {
      id: 'meeting-3',
      user_id: 'user-2',
      title: 'Client Check-in Call',
      description: 'Monthly client progress review',
      meeting_type: 'phone-call',
      platform: 'phone',
      actual_start: new Date('2024-01-17T10:00:00Z').toISOString(),
      actual_end: new Date('2024-01-17T10:45:00Z').toISOString(),
      status: 'completed',
      audio_duration: 2700, // 45 minutes
      processing_status: 'completed',
      processing_progress: 100,
      metadata: JSON.stringify({
        participants_count: 3,
        recording_quality: 'medium',
        call_type: 'inbound'
      })
    }
  ],

  meetingParticipants: [
    // Meeting 1 participants
    { id: 'participant-1', meeting_id: 'meeting-1', name: 'John Doe', email: 'john.doe@example.com', role: 'organizer', attendance_status: 'attended', speaking_time: 420 },
    { id: 'participant-2', meeting_id: 'meeting-1', name: 'Jane Smith', email: 'jane.smith@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 380 },
    { id: 'participant-3', meeting_id: 'meeting-1', name: 'Mike Johnson', email: 'mike.johnson@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 320 },
    { id: 'participant-4', meeting_id: 'meeting-1', name: 'Sarah Wilson', email: 'sarah.wilson@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 290 },
    { id: 'participant-5', meeting_id: 'meeting-1', name: 'Alex Chen', email: 'alex.chen@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 150 },

    // Meeting 2 participants
    { id: 'participant-6', meeting_id: 'meeting-2', name: 'John Doe', email: 'john.doe@example.com', role: 'organizer', attendance_status: 'attended', speaking_time: 1200 },
    { id: 'participant-7', meeting_id: 'meeting-2', name: 'Product Manager', email: 'pm@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 980 },
    { id: 'participant-8', meeting_id: 'meeting-2', name: 'Lead Developer', email: 'dev@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 850 },
    { id: 'participant-9', meeting_id: 'meeting-2', name: 'UX Designer', email: 'ux@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 720 },

    // Meeting 3 participants
    { id: 'participant-10', meeting_id: 'meeting-3', name: 'Jane Smith', email: 'jane.smith@example.com', role: 'organizer', attendance_status: 'attended', speaking_time: 1200 },
    { id: 'participant-11', meeting_id: 'meeting-3', name: 'Client Representative', email: 'client@company.com', role: 'participant', attendance_status: 'attended', speaking_time: 900 },
    { id: 'participant-12', meeting_id: 'meeting-3', name: 'Account Manager', email: 'am@example.com', role: 'participant', attendance_status: 'attended', speaking_time: 600 }
  ],

  transcripts: [
    {
      id: 'transcript-1',
      meeting_id: 'meeting-1',
      content: 'Good morning everyone. Let\'s start our weekly standup. John, can you share what you worked on last week? I focused on the user authentication module and completed the OAuth integration. The tests are passing and it\'s ready for code review. Jane, what about you? I worked on the frontend dashboard redesign. The new components are responsive and I\'ve implemented the dark mode theme. Still working on the mobile optimization. Mike, your turn. I fixed several backend API issues and improved the database query performance. Response times are now 40% faster. Great work everyone. Sarah, any blockers? No major blockers, but I need clarification on the new design requirements for the settings page. I\'ll sync with the design team today. Alex, anything to share? I\'m still working on the testing framework setup. Should be ready for the team to use by Wednesday. Perfect. Let\'s move on to this week\'s goals...',
      language: 'en',
      confidence_score: 0.94,
      word_count: 156,
      processing_time: 12.5,
      model_version: 'whisper-1'
    },
    {
      id: 'transcript-2',
      meeting_id: 'meeting-2',
      content: 'Welcome to our Q1 product planning session. Today we need to finalize our roadmap for the next quarter. Let\'s start by reviewing our current progress. The user onboarding flow is 80% complete and testing shows a 25% improvement in user activation. The mobile app redesign is ahead of schedule and will be ready for beta testing next week. Our API performance improvements have reduced latency by 35% across all endpoints. Now let\'s discuss our Q1 priorities. The top three features we need to deliver are advanced analytics dashboard, team collaboration tools, and improved notification system. The analytics dashboard will provide real-time insights into user behavior and system performance. Team collaboration features include shared workspaces, real-time commenting, and version control. The notification system needs to be more intelligent and less intrusive. Let\'s break down the timeline and resource allocation for each feature...',
      language: 'en',
      confidence_score: 0.92,
      word_count: 178,
      processing_time: 18.3,
      model_version: 'whisper-1'
    },
    {
      id: 'transcript-3',
      meeting_id: 'meeting-3',
      content: 'Hi Sarah, thanks for taking the time for our monthly check-in. How has the project been progressing since our last call? The development team has made excellent progress. We\'ve completed all the features from phase one and are ahead of schedule for phase two. The user feedback from the beta testing has been overwhelmingly positive. That\'s great to hear. What about the timeline for the final delivery? We\'re still on track for the March 15th deadline. The QA testing is scheduled for the first week of March, which gives us buffer time for any issues. Perfect. Are there any concerns or risks we should be aware of? The only potential risk is the third-party API integration we discussed. We\'re waiting for their updated documentation, but we have a fallback plan if needed. Excellent planning. Let\'s schedule our next check-in for February 15th to review the phase two completion...',
      language: 'en',
      confidence_score: 0.91,
      word_count: 167,
      processing_time: 15.2,
      model_version: 'whisper-1'
    }
  ],

  speakers: [
    // Meeting 1 speakers
    { id: 'speaker-1', meeting_id: 'meeting-1', label: 'Speaker A', identified_name: 'John Doe', participant_id: 'participant-1', speaking_time: 420, word_count: 45, confidence_score: 0.95 },
    { id: 'speaker-2', meeting_id: 'meeting-1', label: 'Speaker B', identified_name: 'Jane Smith', participant_id: 'participant-2', speaking_time: 380, word_count: 42, confidence_score: 0.93 },
    { id: 'speaker-3', meeting_id: 'meeting-1', label: 'Speaker C', identified_name: 'Mike Johnson', participant_id: 'participant-3', speaking_time: 320, word_count: 35, confidence_score: 0.92 },
    { id: 'speaker-4', meeting_id: 'meeting-1', label: 'Speaker D', identified_name: 'Sarah Wilson', participant_id: 'participant-4', speaking_time: 290, word_count: 23, confidence_score: 0.94 },
    { id: 'speaker-5', meeting_id: 'meeting-1', label: 'Speaker E', identified_name: 'Alex Chen', participant_id: 'participant-5', speaking_time: 150, word_count: 11, confidence_score: 0.89 },

    // Meeting 2 speakers
    { id: 'speaker-6', meeting_id: 'meeting-2', label: 'Speaker A', identified_name: 'John Doe', participant_id: 'participant-6', speaking_time: 1200, word_count: 65, confidence_score: 0.93 },
    { id: 'speaker-7', meeting_id: 'meeting-2', label: 'Speaker B', identified_name: 'Product Manager', participant_id: 'participant-7', speaking_time: 980, word_count: 58, confidence_score: 0.91 },
    { id: 'speaker-8', meeting_id: 'meeting-2', label: 'Speaker C', identified_name: 'Lead Developer', participant_id: 'participant-8', speaking_time: 850, word_count: 32, confidence_score: 0.92 },
    { id: 'speaker-9', meeting_id: 'meeting-2', label: 'Speaker D', identified_name: 'UX Designer', participant_id: 'participant-9', speaking_time: 720, word_count: 23, confidence_score: 0.88 },

    // Meeting 3 speakers
    { id: 'speaker-10', meeting_id: 'meeting-3', label: 'Speaker A', identified_name: 'Jane Smith', participant_id: 'participant-10', speaking_time: 1200, word_count: 78, confidence_score: 0.94 },
    { id: 'speaker-11', meeting_id: 'meeting-3', label: 'Speaker B', identified_name: 'Client Representative', participant_id: 'participant-11', speaking_time: 900, word_count: 64, confidence_score: 0.90 },
    { id: 'speaker-12', meeting_id: 'meeting-3', label: 'Speaker C', identified_name: 'Account Manager', participant_id: 'participant-12', speaking_time: 600, word_count: 25, confidence_score: 0.89 }
  ],

  meetingAnalysis: [
    {
      id: 'analysis-1',
      meeting_id: 'meeting-1',
      analysis_type: 'comprehensive',
      summary: 'Weekly team standup meeting where team members shared progress updates and discussed upcoming goals. Key highlights include completion of OAuth integration, frontend dashboard redesign progress, and backend performance improvements. No major blockers reported.',
      key_points: JSON.stringify([
        'OAuth integration completed and ready for review',
        'Dashboard redesign with dark mode implemented',
        'Backend API performance improved by 40%',
        'Testing framework setup in progress',
        'Mobile optimization still in progress'
      ]),
      decisions: JSON.stringify([
        'Sarah to sync with design team about settings page requirements',
        'Testing framework to be ready by Wednesday',
        'Code review scheduled for OAuth integration'
      ]),
      topics: JSON.stringify(['authentication', 'frontend', 'backend', 'testing', 'performance']),
      sentiment_analysis: JSON.stringify({
        overall: 'positive',
        speakers: [
          { speaker: 'John Doe', sentiment: 'positive', confidence: 0.85 },
          { speaker: 'Jane Smith', sentiment: 'neutral', confidence: 0.78 },
          { speaker: 'Mike Johnson', sentiment: 'positive', confidence: 0.82 }
        ]
      }),
      confidence_score: 0.89,
      model_version: 'gpt-4-turbo-preview'
    },
    {
      id: 'analysis-2',
      meeting_id: 'meeting-2',
      analysis_type: 'comprehensive',
      summary: 'Q1 product planning session focused on finalizing roadmap and prioritizing key features. Team reviewed current progress showing strong performance metrics and discussed three main priorities: analytics dashboard, collaboration tools, and notification system.',
      key_points: JSON.stringify([
        'User activation improved by 25% with new onboarding',
        'Mobile app redesign ahead of schedule',
        'API latency reduced by 35%',
        'Three Q1 priorities identified: analytics, collaboration, notifications',
        'Timeline and resource allocation discussed'
      ]),
      decisions: JSON.stringify([
        'Analytics dashboard to provide real-time insights',
        'Team collaboration features include shared workspaces',
        'Notification system to be more intelligent and less intrusive',
        'Resource allocation approved for all three priorities'
      ]),
      topics: JSON.stringify(['product planning', 'analytics', 'collaboration', 'notifications', 'roadmap']),
      sentiment_analysis: JSON.stringify({
        overall: 'positive',
        speakers: [
          { speaker: 'John Doe', sentiment: 'positive', confidence: 0.91 },
          { speaker: 'Product Manager', sentiment: 'positive', confidence: 0.88 },
          { speaker: 'Lead Developer', sentiment: 'neutral', confidence: 0.75 }
        ]
      }),
      confidence_score: 0.92,
      model_version: 'gpt-4-turbo-preview'
    }
  ],

  actionItems: [
    // Meeting 1 action items
    {
      id: 'action-1',
      meeting_id: 'meeting-1',
      title: 'Review OAuth integration code',
      description: 'Complete code review for the OAuth integration module',
      assignee_name: 'Jane Smith',
      due_date: new Date('2024-01-17T17:00:00Z').toISOString(),
      priority: 'high',
      category: 'task',
      status: 'completed',
      confidence_score: 0.95,
      completed_at: new Date('2024-01-16T14:30:00Z').toISOString()
    },
    {
      id: 'action-2',
      meeting_id: 'meeting-1',
      title: 'Clarify settings page design requirements',
      description: 'Sync with design team to get clarification on new design requirements',
      assignee_name: 'Sarah Wilson',
      due_date: new Date('2024-01-15T18:00:00Z').toISOString(),
      priority: 'medium',
      category: 'follow-up',
      status: 'completed',
      confidence_score: 0.88,
      completed_at: new Date('2024-01-15T16:45:00Z').toISOString()
    },
    {
      id: 'action-3',
      meeting_id: 'meeting-1',
      title: 'Complete testing framework setup',
      description: 'Finish setting up the testing framework for team use',
      assignee_name: 'Alex Chen',
      due_date: new Date('2024-01-17T17:00:00Z').toISOString(),
      priority: 'medium',
      category: 'task',
      status: 'in_progress',
      confidence_score: 0.92
    },

    // Meeting 2 action items
    {
      id: 'action-4',
      meeting_id: 'meeting-2',
      title: 'Create analytics dashboard wireframes',
      description: 'Design wireframes for the analytics dashboard with real-time insights',
      assignee_name: 'UX Designer',
      due_date: new Date('2024-01-22T17:00:00Z').toISOString(),
      priority: 'high',
      category: 'design',
      status: 'pending',
      confidence_score: 0.89
    },
    {
      id: 'action-5',
      meeting_id: 'meeting-2',
      title: 'Research collaboration tools integration',
      description: 'Investigate third-party APIs for team collaboration features',
      assignee_name: 'Lead Developer',
      due_date: new Date('2024-01-25T17:00:00Z').toISOString(),
      priority: 'medium',
      category: 'research',
      status: 'pending',
      confidence_score: 0.85
    },
    {
      id: 'action-6',
      meeting_id: 'meeting-2',
      title: 'Design notification system architecture',
      description: 'Create technical design for intelligent notification system',
      assignee_name: 'Lead Developer',
      due_date: new Date('2024-01-30T17:00:00Z').toISOString(),
      priority: 'high',
      category: 'task',
      status: 'pending',
      confidence_score: 0.91
    },

    // Meeting 3 action items
    {
      id: 'action-7',
      meeting_id: 'meeting-3',
      title: 'Prepare phase two completion report',
      description: 'Document phase two progress and prepare completion report',
      assignee_name: 'Jane Smith',
      due_date: new Date('2024-02-10T17:00:00Z').toISOString(),
      priority: 'medium',
      category: 'task',
      status: 'pending',
      confidence_score: 0.87
    },
    {
      id: 'action-8',
      meeting_id: 'meeting-3',
      title: 'Follow up on third-party API documentation',
      description: 'Contact vendor for updated API documentation',
      assignee_name: 'Account Manager',
      due_date: new Date('2024-01-20T17:00:00Z').toISOString(),
      priority: 'high',
      category: 'follow-up',
      status: 'pending',
      confidence_score: 0.93
    }
  ],

  mcpIntegrations: [
    {
      id: 'integration-1',
      user_id: 'user-1',
      service_type: 'calendar',
      service_config: JSON.stringify({
        refresh_token: 'sample_refresh_token',
        client_id: 'sample_client_id',
        client_secret: 'sample_client_secret'
      }),
      is_active: true,
      usage_count: 5,
      last_used: new Date('2024-01-15T10:00:00Z').toISOString()
    },
    {
      id: 'integration-2',
      user_id: 'user-1',
      service_type: 'slack',
      service_config: JSON.stringify({
        bot_token: 'xoxb-sample-token',
        team_id: 'T1234567890',
        channel_id: 'C1234567890'
      }),
      is_active: true,
      usage_count: 3,
      last_used: new Date('2024-01-16T15:30:00Z').toISOString()
    },
    {
      id: 'integration-3',
      user_id: 'user-2',
      service_type: 'notion',
      service_config: JSON.stringify({
        api_key: 'secret_sample_notion_key',
        database_id: 'abc123def456'
      }),
      is_active: true,
      usage_count: 2,
      last_used: new Date('2024-01-17T09:15:00Z').toISOString()
    }
  ]
};

/**
 * Seed the database with sample data
 */
async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Initialize database first
    await initializeDatabase();
    const db = getDb();

    // Clear existing data (in correct order to respect foreign keys)
    console.log('🧹 Clearing existing data...');
    
    const tablesToClear = [
      'mcp_automation_logs',
      'mcp_integrations',
      'action_items',
      'meeting_analysis',
      'transcript_segments',
      'audio_chunks',
      'realtime_sessions',
      'speakers',
      'transcripts',
      'meeting_participants',
      'meetings',
      'user_organizations',
      'organizations',
      'users'
    ];

    tablesToClear.forEach(table => {
      db.prepare(`DELETE FROM ${table}`).run();
    });

    // Insert sample data
    console.log('📝 Inserting sample data...');

    // Insert users
    const userStmt = db.prepare(`
      INSERT INTO users (
        id, firebase_uid, email, display_name, provider, 
        subscription_tier, settings, last_login
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    sampleData.users.forEach(user => {
      userStmt.run(
        user.id, user.firebase_uid, user.email, user.display_name,
        user.provider, user.subscription_tier, user.settings
      );
    });

    // Insert organizations
    const orgStmt = db.prepare(`
      INSERT INTO organizations (id, name, description, owner_id, settings)
      VALUES (?, ?, ?, ?, ?)
    `);

    sampleData.organizations.forEach(org => {
      orgStmt.run(org.id, org.name, org.description, org.owner_id, org.settings);
    });

    // Insert user organizations
    const userOrgStmt = db.prepare(`
      INSERT INTO user_organizations (id, user_id, organization_id, role)
      VALUES (?, ?, ?, ?)
    `);

    sampleData.userOrganizations.forEach(userOrg => {
      userOrgStmt.run(userOrg.id, userOrg.user_id, userOrg.organization_id, userOrg.role);
    });

    // Insert meetings
    const meetingStmt = db.prepare(`
      INSERT INTO meetings (
        id, user_id, organization_id, title, description, meeting_type,
        platform, scheduled_start, scheduled_end, actual_start, actual_end,
        status, audio_duration, processing_status, processing_progress, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.meetings.forEach(meeting => {
      meetingStmt.run(
        meeting.id, meeting.user_id, meeting.organization_id, meeting.title,
        meeting.description, meeting.meeting_type, meeting.platform,
        meeting.scheduled_start, meeting.scheduled_end, meeting.actual_start,
        meeting.actual_end, meeting.status, meeting.audio_duration,
        meeting.processing_status, meeting.processing_progress, meeting.metadata
      );
    });

    // Insert meeting participants
    const participantStmt = db.prepare(`
      INSERT INTO meeting_participants (
        id, meeting_id, name, email, role, attendance_status, speaking_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.meetingParticipants.forEach(participant => {
      participantStmt.run(
        participant.id, participant.meeting_id, participant.name,
        participant.email, participant.role, participant.attendance_status,
        participant.speaking_time
      );
    });

    // Insert transcripts
    const transcriptStmt = db.prepare(`
      INSERT INTO transcripts (
        id, meeting_id, content, language, confidence_score,
        word_count, processing_time, model_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.transcripts.forEach(transcript => {
      transcriptStmt.run(
        transcript.id, transcript.meeting_id, transcript.content,
        transcript.language, transcript.confidence_score, transcript.word_count,
        transcript.processing_time, transcript.model_version
      );
    });

    // Insert speakers
    const speakerStmt = db.prepare(`
      INSERT INTO speakers (
        id, meeting_id, label, identified_name, participant_id,
        speaking_time, word_count, confidence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.speakers.forEach(speaker => {
      speakerStmt.run(
        speaker.id, speaker.meeting_id, speaker.label, speaker.identified_name,
        speaker.participant_id, speaker.speaking_time, speaker.word_count,
        speaker.confidence_score
      );
    });

    // Insert meeting analysis
    const analysisStmt = db.prepare(`
      INSERT INTO meeting_analysis (
        id, meeting_id, analysis_type, summary, key_points,
        decisions, topics, sentiment_analysis, confidence_score, model_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.meetingAnalysis.forEach(analysis => {
      analysisStmt.run(
        analysis.id, analysis.meeting_id, analysis.analysis_type,
        analysis.summary, analysis.key_points, analysis.decisions,
        analysis.topics, analysis.sentiment_analysis, analysis.confidence_score,
        analysis.model_version
      );
    });

    // Insert action items
    const actionStmt = db.prepare(`
      INSERT INTO action_items (
        id, meeting_id, title, description, assignee_name, due_date,
        priority, category, status, confidence_score, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.actionItems.forEach(action => {
      actionStmt.run(
        action.id, action.meeting_id, action.title, action.description,
        action.assignee_name, action.due_date, action.priority, action.category,
        action.status, action.confidence_score, action.completed_at || null
      );
    });

    // Insert MCP integrations
    const mcpStmt = db.prepare(`
      INSERT INTO mcp_integrations (
        id, user_id, service_type, service_config, is_active, usage_count, last_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    sampleData.mcpIntegrations.forEach(integration => {
      mcpStmt.run(
        integration.id, integration.user_id, integration.service_type,
        integration.service_config, integration.is_active, integration.usage_count,
        integration.last_used
      );
    });

    console.log('✅ Database seeding completed successfully!');
    console.log(`📊 Seeded data summary:
    - Users: ${sampleData.users.length}
    - Organizations: ${sampleData.organizations.length}
    - Meetings: ${sampleData.meetings.length}
    - Participants: ${sampleData.meetingParticipants.length}
    - Transcripts: ${sampleData.transcripts.length}
    - Speakers: ${sampleData.speakers.length}
    - Analysis: ${sampleData.meetingAnalysis.length}
    - Action Items: ${sampleData.actionItems.length}
    - MCP Integrations: ${sampleData.mcpIntegrations.length}`);

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

/**
 * Clear all data from database
 */
async function clearDatabase() {
  try {
    console.log('🧹 Clearing database...');
    
    const db = getDb();
    
    const tables = [
      'mcp_automation_logs',
      'mcp_integrations', 
      'action_items',
      'meeting_analysis',
      'transcript_segments',
      'audio_chunks',
      'realtime_sessions',
      'speakers',
      'transcripts',
      'meeting_participants',
      'meetings',
      'user_organizations',
      'organizations',
      'users'
    ];

    tables.forEach(table => {
      db.prepare(`DELETE FROM ${table}`).run();
    });

    console.log('✅ Database cleared successfully!');
  } catch (error) {
    console.error('❌ Database clearing failed:', error);
    throw error;
  }
}

// Run seeding if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'clear') {
    clearDatabase()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    seedDatabase()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

module.exports = {
  seedDatabase,
  clearDatabase,
  sampleData
};