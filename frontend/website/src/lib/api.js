import { auth } from './firebase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * API Client for Meeting Intelligence Backend
 */
class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  /**
   * Get Firebase auth token
   */
  async getAuthToken() {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    return null;
  }

  /**
   * Make API request with auth token
   */
  async request(endpoint, options = {}) {
    const token = await this.getAuthToken();
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    console.log(`🌐 API Request: ${config.method || 'GET'} ${this.baseURL}${endpoint}`);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, config);
      
      console.log(`📡 API Response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          message: `HTTP ${response.status}: ${response.statusText}` 
        }));
        
        const errorMessage = errorData.message || errorData.error || `API Error: ${response.status}`;
        console.error(`❌ API Error:`, errorMessage);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log(`✅ API Success:`, data);
      return data;
      
    } catch (error) {
      console.error(`❌ API Request Failed:`, error);
      throw error;
    }
  }

  // ==========================================
  // AUTH ENDPOINTS
  // ==========================================

  /**
   * Verify Firebase token with backend
   */
  async verifyAuth() {
    return this.request('/api/auth/verify', { method: 'POST' });
  }

  /**
   * Get user profile
   */
  async getUserProfile() {
    return this.request('/api/auth/profile');
  }

  /**
   * Update user profile
   */
  async updateUserProfile(data) {
    return this.request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get user settings
   */
  async getUserSettings() {
    return this.request('/api/auth/settings');
  }

  /**
   * Update user settings
   */
  async updateUserSettings(settings) {
    return this.request('/api/auth/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Get user usage statistics
   */
  async getUserUsage(period = 30) {
    return this.request(`/api/auth/usage?period=${period}`);
  }

  /**
   * Delete account
   */
  async deleteAccount(confirmData) {
    return this.request('/api/auth/delete', {
      method: 'DELETE',
      body: JSON.stringify(confirmData),
    });
  }

  // ==========================================
  // MEETING ENDPOINTS
  // ==========================================

  /**
   * Get all meetings
   */
  async getMeetings(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/meetings?${query}`);
  }

  /**
   * Get specific meeting
   */
  async getMeeting(id) {
    return this.request(`/api/meetings/${id}`);
  }

  /**
   * Upload audio file
   */
  async uploadAudio(formData) {
    const token = await this.getAuthToken();
    
    console.log(`🌐 API Upload: POST ${this.baseURL}/api/meetings/upload`);
    
    const response = await fetch(`${this.baseURL}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    console.log(`📡 Upload Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
      console.error(`❌ Upload Error:`, errorData);
      throw new Error(errorData.message || `Upload Error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Upload Success:`, data);
    return data;
  }

  /**
   * Get meeting processing status
   */
  async getMeetingStatus(id) {
    return this.request(`/api/meetings/${id}/status`);
  }

  /**
   * Trigger meeting processing
   */
  async processMeeting(id) {
    return this.request(`/api/meetings/${id}/process`, { method: 'POST' });
  }

  /**
   * Delete meeting
   */
  async deleteMeeting(id) {
    return this.request(`/api/meetings/${id}`, { method: 'DELETE' });
  }

  // ==========================================
  // REAL-TIME RECORDING ENDPOINTS (for Chrome Extension)
  // ==========================================

  /**
   * Start real-time recording session
   */
  async startRealtimeRecording(meetingData) {
    console.log('🎤 Starting real-time recording session...', meetingData);
    return this.request('/api/meetings/start-realtime', {
      method: 'POST',
      body: JSON.stringify({
        meeting: meetingData,
        chunkDuration: 35 // 35-second chunks
      }),
    });
  }

  /**
   * Send audio chunk for real-time processing
   */
  async sendAudioChunk(chunkData) {
    const { meetingId, chunkIndex, audioData, timestamp, size } = chunkData;
    
    console.log(`🎵 Sending audio chunk ${chunkIndex} for meeting ${meetingId} (${size} bytes)`);
    
    return this.request('/api/meetings/audio-chunk', {
      method: 'POST',
      body: JSON.stringify({
        meetingId,
        chunkIndex,
        audioData, // Base64 encoded audio
        timestamp,
        size,
        duration: 35 // 35 seconds
      }),
    });
  }

  /**
   * Stop real-time recording session
   */
  async stopRealtimeRecording(meetingId) {
    console.log('🛑 Stopping real-time recording session...', meetingId);
    return this.request('/api/meetings/stop-realtime', {
      method: 'POST',
      body: JSON.stringify({ meetingId }),
    });
  }

  /**
   * Get real-time session status
   */
  async getRealtimeStatus(meetingId) {
    return this.request(`/api/meetings/${meetingId}/realtime-status`);
  }

  // ==========================================
  // TRANSCRIPTION ENDPOINTS
  // ==========================================

  /**
   * Get meeting transcript
   */
  async getTranscript(meetingId, options = {}) {
    const params = new URLSearchParams(options).toString();
    return this.request(`/api/transcription/${meetingId}?${params}`);
  }

  /**
   * Search transcript
   */
  async searchTranscript(meetingId, query, options = {}) {
    const params = new URLSearchParams({ query, ...options }).toString();
    return this.request(`/api/transcription/${meetingId}/search?${params}`);
  }

  /**
   * Export transcript
   */
  async exportTranscript(meetingId, format = 'txt', options = {}) {
    const token = await this.getAuthToken();
    const params = new URLSearchParams({ format, ...options }).toString();
    
    console.log(`🌐 API Export: GET ${this.baseURL}/api/transcription/${meetingId}/export?${params}`);
    
    const response = await fetch(`${this.baseURL}/api/transcription/${meetingId}/export?${params}`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });

    console.log(`📡 Export Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ Export Error: ${response.status}`);
      throw new Error(`Export failed: ${response.status}`);
    }

    console.log(`✅ Export Success`);
    return response.blob();
  }

  // ==========================================
  // ANALYSIS ENDPOINTS
  // ==========================================

  /**
   * Get meeting analysis
   */
  async getMeetingAnalysis(meetingId) {
    return this.request(`/api/analysis/${meetingId}`);
  }

  /**
   * Get action items
   */
  async getActionItems(meetingId, filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/api/analysis/${meetingId}/action-items?${params}`);
  }

  /**
   * Create action item
   */
  async createActionItem(meetingId, actionItem) {
    return this.request(`/api/analysis/${meetingId}/action-items`, {
      method: 'POST',
      body: JSON.stringify(actionItem),
    });
  }

  /**
   * Update action item
   */
  async updateActionItem(actionItemId, updates) {
    return this.request(`/api/analysis/action-items/${actionItemId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete action item
   */
  async deleteActionItem(actionItemId) {
    return this.request(`/api/analysis/action-items/${actionItemId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // MCP INTEGRATION ENDPOINTS
  // ==========================================

  /**
   * Get MCP integrations
   */
  async getMcpIntegrations() {
    return this.request('/api/mcp/integrations');
  }

  /**
   * Create MCP integration
   */
  async createMcpIntegration(integration) {
    return this.request('/api/mcp/integrations', {
      method: 'POST',
      body: JSON.stringify(integration),
    });
  }

  /**
   * Test MCP integration
   */
  async testMcpIntegration(serviceType) {
    return this.request(`/api/mcp/test-integration/${serviceType}`, {
      method: 'POST',
    });
  }

  /**
   * Schedule meeting via calendar MCP
   */
  async scheduleMeeting(meetingData) {
    return this.request('/api/mcp/calendar/schedule-meeting', {
      method: 'POST',
      body: JSON.stringify(meetingData),
    });
  }

  /**
   * Send email summary
   */
  async sendEmailSummary(emailData) {
    return this.request('/api/mcp/email/send-summary', {
      method: 'POST',
      body: JSON.stringify(emailData),
    });
  }

  /**
   * Post to Slack
   */
  async postToSlack(slackData) {
    return this.request('/api/mcp/slack/post-summary', {
      method: 'POST',
      body: JSON.stringify(slackData),
    });
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================

  /**
   * Check backend health
   */
  async healthCheck() {
    return this.request('/health');
  }

  // ==========================================
  // EXTENSION UTILITIES
  // ==========================================

  /**
   * Validate audio chunk before sending
   */
  validateAudioChunk(chunkData) {
    const { meetingId, chunkIndex, audioData, size } = chunkData;
    
    const errors = [];
    
    if (!meetingId) errors.push('Meeting ID is required');
    if (chunkIndex === undefined) errors.push('Chunk index is required');
    if (!audioData) errors.push('Audio data is required');
    if (!size || size <= 0) errors.push('Valid audio size is required');
    
    // Validate base64 format
    if (audioData && !/^[A-Za-z0-9+/]*={0,2}$/.test(audioData)) {
      errors.push('Audio data must be valid base64');
    }
    
    // Check size limits (max 10MB per chunk)
    if (size && size > 10 * 1024 * 1024) {
      errors.push('Audio chunk too large (max 10MB)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert audio blob to base64 for sending
   */
  async audioBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Create singleton instance
const api = new ApiClient();

export default api;