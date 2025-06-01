const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'meeting_intelligence.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const initializeDatabase = async () => {
  try {
    // Users table (for Firebase Auth integration)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        firebase_uid TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT,
        photo_url TEXT,
        provider TEXT DEFAULT 'email',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1,
        subscription_tier TEXT DEFAULT 'free',
        settings JSON DEFAULT '{}'
      )
    `);

    // Organizations table (for multi-tenancy)
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settings JSON DEFAULT '{}',
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // User organization memberships
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_organizations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(user_id, organization_id)
      )
    `);

    // Meetings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organization_id TEXT,
        title TEXT,
        description TEXT,
        meeting_type TEXT DEFAULT 'unknown',
        platform TEXT,
        external_meeting_id TEXT,
        scheduled_start DATETIME,
        scheduled_end DATETIME,
        actual_start DATETIME,
        actual_end DATETIME,
        status TEXT DEFAULT 'scheduled',
        audio_file_path TEXT,
        audio_file_size INTEGER,
        audio_duration REAL,
        processing_status TEXT DEFAULT 'pending',
        processing_progress INTEGER DEFAULT 0,
        error_message TEXT,
        metadata JSON DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
      )
    `);

    // Meeting participants
    db.exec(`
      CREATE TABLE IF NOT EXISTS meeting_participants (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        user_id TEXT,
        name TEXT,
        email TEXT,
        role TEXT DEFAULT 'participant',
        attendance_status TEXT DEFAULT 'unknown',
        join_time DATETIME,
        leave_time DATETIME,
        speaking_time REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Transcripts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT DEFAULT 'en',
        confidence_score REAL,
        word_count INTEGER,
        processing_time REAL,
        model_version TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      )
    `);

    // Transcript segments (for real-time processing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcript_segments (
        id TEXT PRIMARY KEY,
        transcript_id TEXT NOT NULL,
        speaker_id TEXT,
        content TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        confidence_score REAL,
        word_timestamps JSON,
        segment_index INTEGER,
        is_final BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE,
        FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE SET NULL
      )
    `);

    // Speakers table (for diarization)
    db.exec(`
      CREATE TABLE IF NOT EXISTS speakers (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        label TEXT NOT NULL,
        identified_name TEXT,
        participant_id TEXT,
        voice_profile JSON,
        speaking_time REAL DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        confidence_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES meeting_participants(id) ON DELETE SET NULL,
        UNIQUE(meeting_id, label)
      )
    `);

    // Meeting analysis results
    db.exec(`
      CREATE TABLE IF NOT EXISTS meeting_analysis (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        analysis_type TEXT NOT NULL,
        summary TEXT,
        key_points JSON,
        decisions JSON,
        topics JSON,
        sentiment_analysis JSON,
        confidence_score REAL,
        model_version TEXT,
        processing_time REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      )
    `);

    // Action items
    db.exec(`
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        assignee_id TEXT,
        assignee_name TEXT,
        due_date DATETIME,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        category TEXT,
        context_timestamp REAL,
        confidence_score REAL,
        extracted_from_text TEXT,
        metadata JSON DEFAULT '{}',
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Real-time sessions (for WebSocket management)
    db.exec(`
      CREATE TABLE IF NOT EXISTS realtime_sessions (
        id TEXT PRIMARY KEY,
        socket_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        meeting_id TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        chunks_processed INTEGER DEFAULT 0,
        total_duration REAL DEFAULT 0,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
      )
    `);

    // Audio chunks (for real-time processing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        file_path TEXT,
        duration REAL,
        size INTEGER,
        processed BOOLEAN DEFAULT 0,
        transcript_segment_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES realtime_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (transcript_segment_id) REFERENCES transcript_segments(id) ON DELETE SET NULL,
        UNIQUE(session_id, chunk_index)
      )
    `);

    // MCP integrations tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_integrations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        service_type TEXT NOT NULL,
        service_config JSON NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        last_used DATETIME,
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, service_type)
      )
    `);

    // MCP automation logs
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_automation_logs (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        integration_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_data JSON,
        status TEXT DEFAULT 'pending',
        result JSON,
        error_message TEXT,
        executed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
        FOREIGN KEY (integration_id) REFERENCES mcp_integrations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status)',
      'CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON meeting_participants(meeting_id)',
      'CREATE INDEX IF NOT EXISTS idx_transcripts_meeting_id ON transcripts(meeting_id)',
      'CREATE INDEX IF NOT EXISTS idx_transcript_segments_transcript_id ON transcript_segments(transcript_id)',
      'CREATE INDEX IF NOT EXISTS idx_transcript_segments_start_time ON transcript_segments(start_time)',
      'CREATE INDEX IF NOT EXISTS idx_speakers_meeting_id ON speakers(meeting_id)',
      'CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id ON action_items(meeting_id)',
      'CREATE INDEX IF NOT EXISTS idx_action_items_assignee_id ON action_items(assignee_id)',
      'CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status)',
      'CREATE INDEX IF NOT EXISTS idx_action_items_due_date ON action_items(due_date)',
      'CREATE INDEX IF NOT EXISTS idx_realtime_sessions_socket_id ON realtime_sessions(socket_id)',
      'CREATE INDEX IF NOT EXISTS idx_realtime_sessions_user_id ON realtime_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audio_chunks_session_id ON audio_chunks(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_mcp_integrations_user_id ON mcp_integrations(user_id)'
    ];

    indexes.forEach(indexQuery => {
      db.exec(indexQuery);
    });

    console.log('✅ Database tables and indexes created successfully');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

// Database utility functions
const getDb = () => db;

const closeDb = () => {
  if (db) {
    db.close();
    console.log('Database connection closed');
  }
};

module.exports = {
  initializeDatabase,
  getDb,
  closeDb
};