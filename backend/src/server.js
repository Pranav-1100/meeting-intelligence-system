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

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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

// Middleware
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

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
  res.status(404).json({ error: 'Route not found' });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle real-time audio streaming
  socket.on('start-recording', async (data) => {
    try {
      await handleRealtimeAudio.startRecording(socket, data);
    } catch (error) {
      console.error('Error starting recording:', error);
      socket.emit('error', { message: 'Failed to start recording' });
    }
  });

  socket.on('audio-chunk', async (data) => {
    try {
      await handleRealtimeAudio.processAudioChunk(socket, data);
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      socket.emit('error', { message: 'Failed to process audio chunk' });
    }
  });

  socket.on('stop-recording', async (data) => {
    try {
      await handleRealtimeAudio.stopRecording(socket, data);
    } catch (error) {
      console.error('Error stopping recording:', error);
      socket.emit('error', { message: 'Failed to stop recording' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Cleanup any ongoing recordings for this socket
    handleRealtimeAudio.cleanup(socket.id);
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Start server
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
      console.log(`🚀 Meeting Intelligence Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server ready for real-time connections`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
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