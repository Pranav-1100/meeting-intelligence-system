require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import database
const { initializeDatabase } = require('./database/init');

// Import middleware
const { authenticateFirebase } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const transcriptionRoutes = require('./routes/transcription');
const analysisRoutes = require('./routes/analysis');
const mcpRoutes = require('./routes/mcp');

// Import WebSocket handlers
const { handleRealtimeAudio } = require('./services/realtime');

const app = express();
const server = http.createServer(app);

// FIXED: Configure CORS for Socket.IO with Chrome Extension support
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000", // Frontend
      "chrome-extension://*",  // Chrome extensions
      /^chrome-extension:\/\/[a-z]+$/  // Chrome extension pattern
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Middleware - FIXED: Add Chrome Extension CORS support
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow extensions
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(limiter);
app.use(morgan('combined'));

// FIXED: Updated CORS configuration for Chrome Extensions
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or chrome extensions)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://meetingintelligence.ai',
      process.env.FRONTEND_URL
    ];
    
    // Allow Chrome extension origins
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Allow other origins from allowedOrigins
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // For development, allow any localhost origin
    if (origin.includes('localhost')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Health check - Enhanced for debugging
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    origin: req.headers.origin || 'no-origin',
    userAgent: req.headers['user-agent']
  });
});

// CORS preflight for all routes
app.options('*', cors());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', authenticateFirebase, meetingRoutes);
app.use('/api/transcription', authenticateFirebase, transcriptionRoutes);
app.use('/api/analysis', authenticateFirebase, analysisRoutes);
app.use('/api/mcp', authenticateFirebase, mcpRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method 
  });
});

// WebSocket connection handling - Enhanced logging
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id} from origin: ${socket.handshake.headers.origin}`);

  // Handle real-time audio streaming
  socket.on('start_meeting', async (data) => {
    try {
      console.log('Starting meeting:', data);
      socket.emit('meeting_started', { meetingId: data.id, status: 'started' });
    } catch (error) {
      console.error('Error starting meeting:', error);
      socket.emit('error', { message: 'Failed to start meeting' });
    }
  });

  socket.on('audio_chunk', async (data) => {
    try {
      console.log('Received audio chunk:', data.chunkIndex);
      // Process audio chunk here
      socket.emit('transcript_update', {
        content: `Processing chunk ${data.chunkIndex}...`,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      socket.emit('error', { message: 'Failed to process audio chunk' });
    }
  });

  socket.on('end_meeting', async (data) => {
    try {
      console.log('Ending meeting:', data);
      socket.emit('meeting_ended', { meetingId: data.meetingId, status: 'ended' });
    } catch (error) {
      console.error('Error ending meeting:', error);
      socket.emit('error', { message: 'Failed to end meeting' });
    }
  });

  socket.on('authenticate', (data) => {
    console.log('Client authentication attempt');
    // Handle authentication here
    socket.emit('authenticated', { status: 'authenticated' });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Cleanup any ongoing recordings for this socket
    if (handleRealtimeAudio && handleRealtimeAudio.cleanup) {
      handleRealtimeAudio.cleanup(socket.id);
    }
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Start server
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
      console.log(`🚀 Meeting Intelligence Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server ready for real-time connections`);
      console.log(`🌐 CORS enabled for Chrome extensions and localhost origins`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();