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

    const response = await fetch(`${this.baseURL}${endpoint}`, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `API Error: ${response.status}`);
    }
    
    return response.json();
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
    
    const response = await fetch(`${this.baseURL}/api/meetings/upload`, {
      method: 'POST',
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(errorData.message || `Upload Error: ${response.status}`);
    }

    return response.json();
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
    
    const response = await fetch(`${this.baseURL}/api/transcription/${meetingId}/export?${params}`, {
      headers: {
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }

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
}

// Create singleton instance
const api = new ApiClient();

export default api;