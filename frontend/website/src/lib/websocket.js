import { io } from 'socket.io-client';
import { auth } from './firebase';

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

/**
 * WebSocket Client for Real-time Meeting Intelligence
 */
class WebSocketClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.currentMeetingId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    if (this.socket && this.isConnected) {
      return;
    }

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      
      this.socket = io(WS_BASE_URL, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      this.setupEventListeners();
      
      return new Promise((resolve, reject) => {
        this.socket.on('connect', () => {
          console.log('✅ WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('❌ WebSocket connection error:', error);
          this.isConnected = false;
          reject(error);
        });
      });
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.isConnected = false;
      
      // Auto-reconnect on unexpected disconnection
      if (reason === 'io server disconnect') {
        this.handleReconnect();
      }
    });

    // Real-time transcript events
    this.socket.on('transcript_update', (data) => {
      this.emit('transcript_update', data);
    });

    // Processing status events
    this.socket.on('processing_status', (data) => {
      this.emit('processing_status', data);
    });

    // Action items events
    this.socket.on('action_item_detected', (data) => {
      this.emit('action_item_detected', data);
    });

    // Speaker detection events
    this.socket.on('speaker_detected', (data) => {
      this.emit('speaker_detected', data);
    });

    // Error events
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });

    // Meeting events
    this.socket.on('meeting_started', (data) => {
      console.log('🎙️ Meeting started:', data.meetingId);
      this.currentMeetingId = data.meetingId;
      this.emit('meeting_started', data);
    });

    this.socket.on('meeting_ended', (data) => {
      console.log('🏁 Meeting ended:', data.meetingId);
      this.currentMeetingId = null;
      this.emit('meeting_ended', data);
    });

    // Chunk processing events
    this.socket.on('chunk_processed', (data) => {
      this.emit('chunk_processed', data);
    });
  }

  /**
   * Handle reconnection logic
   */
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('max_reconnect_reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        this.handleReconnect();
      });
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentMeetingId = null;
      console.log('🔌 WebSocket manually disconnected');
    }
  }

  /**
   * Start real-time meeting session
   */
  async startMeeting(meetingData) {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('start_meeting', meetingData, (response) => {
        if (response.success) {
          this.currentMeetingId = response.meetingId;
          console.log('🎙️ Real-time meeting started:', response.meetingId);
          resolve(response);
        } else {
          console.error('Failed to start meeting:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Send audio chunk for processing
   */
  sendAudioChunk(audioData, chunkIndex) {
    if (!this.isConnected || !this.currentMeetingId) {
      console.warn('Cannot send audio chunk: not connected or no active meeting');
      return;
    }

    this.socket.emit('audio_chunk', {
      meetingId: this.currentMeetingId,
      audioData: audioData,
      chunkIndex: chunkIndex,
      timestamp: Date.now()
    });
  }

  /**
   * End real-time meeting session
   */
  async endMeeting() {
    if (!this.isConnected || !this.currentMeetingId) {
      console.warn('Cannot end meeting: not connected or no active meeting');
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('end_meeting', { meetingId: this.currentMeetingId }, (response) => {
        if (response.success) {
          console.log('🏁 Meeting ended successfully');
          this.currentMeetingId = null;
          resolve(response);
        } else {
          console.error('Failed to end meeting:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  /**
   * Join meeting room for live updates
   */
  joinMeetingRoom(meetingId) {
    if (!this.isConnected) {
      console.warn('Cannot join meeting room: not connected');
      return;
    }

    this.socket.emit('join_meeting', { meetingId });
    console.log('👥 Joined meeting room:', meetingId);
  }

  /**
   * Leave meeting room
   */
  leaveMeetingRoom(meetingId) {
    if (!this.isConnected) {
      return;
    }

    this.socket.emit('leave_meeting', { meetingId });
    console.log('👋 Left meeting room:', meetingId);
  }

  /**
   * Send manual correction
   */
  sendCorrection(correctionData) {
    if (!this.isConnected) {
      console.warn('Cannot send correction: not connected');
      return;
    }

    this.socket.emit('transcript_correction', correctionData);
  }

  /**
   * Event listener management
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      currentMeetingId: this.currentMeetingId,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Create singleton instance
const wsClient = new WebSocketClient();

export default wsClient;