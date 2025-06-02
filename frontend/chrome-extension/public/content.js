console.log('Meeting Intelligence: Enhanced content script with real-time updates loaded');

// Configuration
const MEETING_CONFIG = {
  OVERLAY_ID: 'meeting-intelligence-overlay',
  INDICATOR_ID: 'meeting-intelligence-indicator',
  TRANSCRIPT_PANEL_ID: 'meeting-intelligence-transcript-panel',
  SUPPORTED_PLATFORMS: {
    'meet.google.com': {
      name: 'Google Meet',
      selectors: {
        participants: '[data-participant-id]',
        chatButton: '[data-tooltip*="chat" i]',
        micButton: '[data-tooltip*="microphone" i]',
        cameraButton: '[data-tooltip*="camera" i]'
      }
    },
    'zoom.us': {
      name: 'Zoom',
      selectors: {
        participants: '.participants-item',
        chatButton: '.footer-button__chat',
        micButton: '.footer-button__audio'
      }
    },
    'teams.microsoft.com': {
      name: 'Microsoft Teams',
      selectors: {
        participants: '[data-tid="roster-participant"]',
        chatButton: '[data-tid="chat-button"]',
        micButton: '[data-tid="microphone-button"]'
      }
    }
  }
};

// State
let isRecording = false;
let isAuthenticated = false;
let currentMeeting = null;
let overlay = null;
let indicator = null;
let transcriptPanel = null;
let platform = null;
let liveTranscript = '';
let actionItems = [];
let isTranscriptPanelOpen = false;
let chunkCounter = 0;
let lastTranscriptUpdate = Date.now();

// Initialize when page loads
function initialize() {
  platform = detectPlatform();
  if (platform) {
    console.log(`Meeting Intelligence: Detected platform - ${platform.name}`);
    setupMeetingDetection();
    createRecordingIndicator();
    createLiveTranscriptPanel();
    
    // Check recording and auth status
    checkStatus();
  }
}

// Check status from background
function checkStatus() {
  chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
    if (response) {
      isRecording = response.isRecording;
      isAuthenticated = response.isAuthenticated;
      currentMeeting = response.currentMeeting;
      
      if (isRecording && currentMeeting) {
        handleRecordingStarted(currentMeeting);
      }
      
      updateRecordingIndicator();
    }
  });
}

// Detect meeting platform
function detectPlatform() {
  const hostname = window.location.hostname;
  for (const [domain, config] of Object.entries(MEETING_CONFIG.SUPPORTED_PLATFORMS)) {
    if (hostname.includes(domain)) {
      return { domain, ...config };
    }
  }
  return null;
}

// Setup meeting detection
function setupMeetingDetection() {
  // Listen for URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleUrlChange();
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial check
  handleUrlChange();
}

// Handle URL changes
function handleUrlChange() {
  const isInMeeting = checkIfInMeeting();
  console.log('Meeting Intelligence: In meeting?', isInMeeting);
  
  if (isInMeeting) {
    setupMeetingInterface();
  } else {
    cleanupMeetingInterface();
  }
}

// Check if currently in a meeting
function checkIfInMeeting() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  
  if (hostname.includes('meet.google.com')) {
    return pathname.length > 1 && !pathname.includes('_meet');
  }
  
  if (hostname.includes('zoom.us')) {
    return pathname.includes('/j/') || pathname.includes('/wc/join/');
  }
  
  if (hostname.includes('teams.microsoft.com')) {
    return pathname.includes('/l/meetup-join/') || document.querySelector('[data-tid="calling-screen"]');
  }
  
  return false;
}

// Setup meeting interface
function setupMeetingInterface() {
  console.log('Meeting Intelligence: Setting up meeting interface');
  
  // Wait for meeting UI to load
  setTimeout(() => {
    if (!indicator) {
      createRecordingIndicator();
    }
    if (!transcriptPanel) {
      createLiveTranscriptPanel();
    }
    updateRecordingIndicator();
  }, 2000);
}

// Cleanup meeting interface
function cleanupMeetingInterface() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

// Create recording indicator with enhanced auth status
function createRecordingIndicator() {
  if (indicator) return;

  indicator = document.createElement('div');
  indicator.id = MEETING_CONFIG.INDICATOR_ID;
  indicator.className = 'meeting-intelligence-indicator';
  
  indicator.innerHTML = `
    <div class="mi-indicator-content">
      <div class="mi-indicator-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      </div>
      <div class="mi-indicator-text">Meeting Intelligence</div>
      <div class="mi-indicator-status">Checking...</div>
      <button class="mi-indicator-button" id="mi-record-button">
        <span class="mi-button-text">Open Extension</span>
      </button>
      <button class="mi-transcript-button" id="mi-transcript-button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14,17H7V15H14M17,13H7V11H17M17,9H7V7H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z"/>
        </svg>
      </button>
    </div>
  `;

  // Add enhanced styles for auth and real-time features
  const style = document.createElement('style');
  style.textContent = `
    .meeting-intelligence-indicator {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      color: #374151;
      min-width: 320px;
      transition: all 0.3s ease;
    }
    
    .mi-indicator-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .mi-indicator-icon {
      color: #3b82f6;
      flex-shrink: 0;
    }
    
    .mi-indicator-icon.authenticated {
      color: #10b981;
    }
    
    .mi-indicator-icon.recording {
      color: #ef4444;
      animation: pulse 2s infinite;
    }
    
    .mi-indicator-text {
      font-weight: 600;
      flex-grow: 1;
    }
    
    .mi-indicator-status {
      font-size: 12px;
      color: #6b7280;
      min-width: 80px;
    }
    
    .mi-indicator-status.authenticated {
      color: #10b981;
    }
    
    .mi-indicator-status.not-authenticated {
      color: #ef4444;
    }
    
    .mi-indicator-status.recording {
      color: #ef4444;
      animation: pulse 2s infinite;
    }
    
    .mi-indicator-button, .mi-transcript-button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
      margin-left: 4px;
    }
    
    .mi-transcript-button {
      background: #10b981;
      padding: 6px 8px;
    }
    
    .mi-indicator-button:hover {
      background: #2563eb;
    }
    
    .mi-transcript-button:hover {
      background: #059669;
    }
    
    .mi-indicator-button.recording {
      background: #ef4444;
      animation: pulse 2s infinite;
    }
    
    .mi-indicator-button.recording:hover {
      background: #dc2626;
    }
    
    .mi-indicator-button.not-authenticated {
      background: #f59e0b;
    }
    
    .mi-indicator-button.not-authenticated:hover {
      background: #d97706;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    /* Enhanced Live Transcript Panel Styles */
    .meeting-intelligence-transcript-panel {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 450px;
      max-height: 700px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(20px);
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }
    
    .meeting-intelligence-transcript-panel.open {
      transform: translateX(0);
    }
    
    .mi-panel-header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .mi-panel-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 16px;
    }
    
    .mi-recording-dot {
      width: 12px;
      height: 12px;
      background: #ef4444;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    .mi-chunk-counter {
      background: rgba(255, 255, 255, 0.2);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    
    .mi-panel-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .mi-panel-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }
    
    .mi-panel-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    
    .mi-panel-content {
      height: 550px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .mi-panel-tabs {
      display: flex;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .mi-tab {
      flex: 1;
      padding: 12px 16px;
      background: none;
      border: none;
      color: #64748b;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    
    .mi-tab.active {
      color: #10b981;
      background: white;
    }
    
    .mi-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #10b981;
    }
    
    .mi-tab-content {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.6;
    }
    
    .mi-transcript-content {
      color: #374151;
      white-space: pre-wrap;
      word-wrap: break-word;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 16px;
      border-radius: 12px;
      min-height: 300px;
      max-height: 400px;
      overflow-y: auto;
      font-family: ui-monospace, 'SF Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
    }
    
    .mi-transcript-chunk {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #dcfce7;
    }
    
    .mi-transcript-chunk:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }
    
    .mi-chunk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 11px;
      color: #059669;
      font-weight: 600;
    }
    
    .mi-chunk-time {
      background: rgba(16, 185, 129, 0.1);
      padding: 2px 6px;
      border-radius: 8px;
    }
    
    .mi-action-items {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .mi-action-item {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 1px solid #bae6fd;
      border-radius: 12px;
      padding: 16px;
      position: relative;
      overflow: hidden;
      animation: slideInFade 0.5s ease;
    }
    
    .mi-action-item::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: #3b82f6;
    }
    
    .mi-action-item-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .mi-action-item-title {
      font-weight: 600;
      color: #0c4a6e;
      font-size: 14px;
      line-height: 1.4;
      flex: 1;
    }
    
    .mi-action-item-time {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 12px;
      font-weight: 500;
      white-space: nowrap;
    }
    
    .mi-action-item-assignee {
      color: #0369a1;
      font-size: 12px;
      font-weight: 500;
      margin-top: 4px;
    }
    
    .mi-action-item-priority {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    .mi-action-item-priority.high {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .mi-action-item-priority.medium {
      background: #fef3c7;
      color: #92400e;
    }
    
    .mi-action-item-priority.low {
      background: #ecfdf5;
      color: #065f46;
    }
    
    .mi-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 250px;
      color: #9ca3af;
      text-align: center;
    }
    
    .mi-empty-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }
    
    /* Custom scrollbar */
    .mi-tab-content::-webkit-scrollbar,
    .mi-transcript-content::-webkit-scrollbar {
      width: 6px;
    }
    
    .mi-tab-content::-webkit-scrollbar-track,
    .mi-transcript-content::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .mi-tab-content::-webkit-scrollbar-thumb,
    .mi-transcript-content::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 3px;
    }
    
    .mi-tab-content::-webkit-scrollbar-thumb:hover,
    .mi-transcript-content::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
    
    /* Animation for new items */
    @keyframes slideInFade {
      from { 
        opacity: 0; 
        transform: translateY(10px); 
      }
      to { 
        opacity: 1; 
        transform: translateY(0); 
      }
    }
    
    .mi-processing-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #059669;
      font-size: 12px;
      font-weight: 500;
      padding: 8px 0;
    }
    
    .mi-processing-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(indicator);

  // Add event listeners
  const recordButton = indicator.querySelector('#mi-record-button');
  recordButton.addEventListener('click', handleRecordButtonClick);
  
  const transcriptButton = indicator.querySelector('#mi-transcript-button');
  transcriptButton.addEventListener('click', toggleTranscriptPanel);
}

// Create enhanced live transcript panel
function createLiveTranscriptPanel() {
  if (transcriptPanel) return;

  transcriptPanel = document.createElement('div');
  transcriptPanel.id = MEETING_CONFIG.TRANSCRIPT_PANEL_ID;
  transcriptPanel.className = 'meeting-intelligence-transcript-panel';
  
  transcriptPanel.innerHTML = `
    <div class="mi-panel-header">
      <div class="mi-panel-title">
        <div class="mi-recording-dot" id="mi-recording-dot" style="display: none;"></div>
        <span>Live Transcript</span>
        <div class="mi-chunk-counter" id="mi-chunk-counter" style="display: none;">0 chunks</div>
      </div>
      <div class="mi-panel-controls">
        <button class="mi-panel-btn" id="mi-minimize-btn" title="Minimize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19,13H5V11H19V13Z"/>
          </svg>
        </button>
        <button class="mi-panel-btn" id="mi-close-btn" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="mi-panel-content">
      <div class="mi-panel-tabs">
        <button class="mi-tab active" id="transcript-tab">Transcript</button>
        <button class="mi-tab" id="action-items-tab">Action Items</button>
        <button class="mi-tab" id="analytics-tab">Analytics</button>
      </div>
      <div class="mi-tab-content" id="transcript-content">
        <div class="mi-transcript-content" id="mi-live-transcript">
          <div class="mi-empty-state">
            <svg class="mi-empty-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            <div>Start recording to see live transcript</div>
            <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">35-second chunks will be processed in real-time</div>
          </div>
        </div>
      </div>
      <div class="mi-tab-content" id="action-items-content" style="display: none;">
        <div class="mi-action-items" id="mi-action-items-list">
          <div class="mi-empty-state">
            <svg class="mi-empty-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21Z"/>
            </svg>
            <div>Action items will appear here automatically</div>
          </div>
        </div>
      </div>
      <div class="mi-tab-content" id="analytics-content" style="display: none;">
        <div id="mi-analytics-data">
          <div class="mi-empty-state">
            <svg class="mi-empty-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z"/>
            </svg>
            <div>Analytics will appear during recording</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(transcriptPanel);

  // Setup tab switching
  const tabs = transcriptPanel.querySelectorAll('.mi-tab');
  const tabContents = transcriptPanel.querySelectorAll('.mi-tab-content');
  
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.style.display = 'none');
      
      tab.classList.add('active');
      tabContents[index].style.display = 'block';
    });
  });

  // Setup panel controls
  const closeBtn = transcriptPanel.querySelector('#mi-close-btn');
  closeBtn.addEventListener('click', () => {
    closeTranscriptPanel();
  });

  const minimizeBtn = transcriptPanel.querySelector('#mi-minimize-btn');
  minimizeBtn.addEventListener('click', () => {
    // TODO: Implement minimize functionality
    console.log('Minimize panel');
  });
}

// Toggle transcript panel
function toggleTranscriptPanel() {
  if (isTranscriptPanelOpen) {
    closeTranscriptPanel();
  } else {
    openTranscriptPanel();
  }
}

// Open transcript panel
function openTranscriptPanel() {
  if (transcriptPanel) {
    transcriptPanel.classList.add('open');
    isTranscriptPanelOpen = true;
  }
}

// Close transcript panel
function closeTranscriptPanel() {
  if (transcriptPanel) {
    transcriptPanel.classList.remove('open');
    isTranscriptPanelOpen = false;
  }
}

// Update recording indicator with auth status
function updateRecordingIndicator() {
  if (!indicator) return;

  const statusEl = indicator.querySelector('.mi-indicator-status');
  const buttonEl = indicator.querySelector('#mi-record-button');
  const buttonText = buttonEl.querySelector('.mi-button-text');
  const iconEl = indicator.querySelector('.mi-indicator-icon');
  const recordingDot = document.querySelector('#mi-recording-dot');
  const chunkCounter = document.querySelector('#mi-chunk-counter');

  // Update based on states
  if (isRecording) {
    statusEl.textContent = 'Recording';
    statusEl.className = 'mi-indicator-status recording';
    buttonText.textContent = 'Recording...';
    buttonEl.classList.add('recording');
    iconEl.classList.add('recording');
    if (recordingDot) {
      recordingDot.style.display = 'block';
    }
    if (chunkCounter) {
      chunkCounter.style.display = 'block';
      chunkCounter.textContent = `${chunkCounter} chunks`;
    }
  } else if (!isAuthenticated) {
    statusEl.textContent = 'Not Logged In';
    statusEl.className = 'mi-indicator-status not-authenticated';
    buttonText.textContent = 'Login Required';
    buttonEl.classList.add('not-authenticated');
    iconEl.className = 'mi-indicator-icon';
    if (recordingDot) recordingDot.style.display = 'none';
    if (chunkCounter) chunkCounter.style.display = 'none';
  } else {
    statusEl.textContent = 'Ready';
    statusEl.className = 'mi-indicator-status authenticated';
    buttonText.textContent = 'Open Extension';
    buttonEl.className = 'mi-indicator-button';
    iconEl.classList.add('authenticated');
    if (recordingDot) recordingDot.style.display = 'none';
    if (chunkCounter) chunkCounter.style.display = 'none';
  }
}

// Handle record button click
function handleRecordButtonClick() {
  if (!isAuthenticated) {
    showNotification('Please log in to the dashboard first', 'error');
    // Open frontend for login
    window.open('http://localhost:3000', '_blank');
    return;
  }
  
  // Open extension popup for recording
  showNotification('Opening extension popup to start recording...', 'info');
  chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
}

// Enhanced live transcript update with chunk support
function updateLiveTranscript(transcriptData) {
  const transcriptEl = document.getElementById('mi-live-transcript');
  
  if (transcriptEl) {
    // Clear empty state if this is the first transcript
    if (transcriptEl.querySelector('.mi-empty-state')) {
      transcriptEl.innerHTML = '';
      liveTranscript = '';
    }
    
    // Add processing indicator if needed
    if (!transcriptEl.querySelector('.mi-processing-indicator')) {
      const processingDiv = document.createElement('div');
      processingDiv.className = 'mi-processing-indicator';
      processingDiv.innerHTML = `
        <div class="mi-processing-dot"></div>
        <span>Processing 35-second chunks...</span>
      `;
      transcriptEl.appendChild(processingDiv);
    }
    
    // Handle different types of transcript updates
    if (typeof transcriptData === 'string') {
      // Simple text update
      addTranscriptChunk(transcriptData);
    } else if (transcriptData.content) {
      // Structured transcript data
      addTranscriptChunk(transcriptData.content, transcriptData.chunkIndex, transcriptData.timestamp);
    }
    
    // Auto scroll to bottom
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    
    // Auto-open panel if not open and recording
    if (isRecording && !isTranscriptPanelOpen) {
      openTranscriptPanel();
    }
    
    lastTranscriptUpdate = Date.now();
  }
}

// Add transcript chunk with timestamp and chunk info
function addTranscriptChunk(content, chunkIndex, timestamp) {
  const transcriptEl = document.getElementById('mi-live-transcript');
  
  if (content && content.trim()) {
    const chunkDiv = document.createElement('div');
    chunkDiv.className = 'mi-transcript-chunk';
    
    const currentTime = timestamp ? new Date(timestamp) : new Date();
    const chunkNumber = chunkIndex !== undefined ? chunkIndex : chunkCounter++;
    
    chunkDiv.innerHTML = `
      <div class="mi-chunk-header">
        <span>Chunk ${chunkNumber + 1}</span>
        <span class="mi-chunk-time">${currentTime.toLocaleTimeString()}</span>
      </div>
      <div class="mi-chunk-content">${content}</div>
    `;
    
    transcriptEl.appendChild(chunkDiv);
    
    // Update chunk counter in header
    const chunkCounterEl = document.querySelector('#mi-chunk-counter');
    if (chunkCounterEl) {
      chunkCounterEl.textContent = `${chunkNumber + 1} chunks`;
    }
    
    liveTranscript += content + '\n';
  }
}

// Enhanced action items update
function updateActionItems(newActionItem) {
  const actionItemsList = document.getElementById('mi-action-items-list');
  
  if (actionItemsList) {
    // Clear empty state if this is the first action item
    if (actionItemsList.querySelector('.mi-empty-state')) {
      actionItemsList.innerHTML = '';
    }
    
    actionItems.push(newActionItem);
    
    const itemEl = document.createElement('div');
    itemEl.className = 'mi-action-item';
    
    const timeAgo = new Date(newActionItem.timestamp || Date.now()).toLocaleTimeString();
    
    itemEl.innerHTML = `
      <div class="mi-action-item-header">
        <div class="mi-action-item-title">${newActionItem.title}</div>
        <div class="mi-action-item-time">${timeAgo}</div>
      </div>
      ${newActionItem.assignee ? `<div class="mi-action-item-assignee">📋 ${newActionItem.assignee}</div>` : ''}
      ${newActionItem.priority ? `<div class="mi-action-item-priority ${newActionItem.priority}">${newActionItem.priority}</div>` : ''}
    `;
    
    actionItemsList.appendChild(itemEl);
    
    // Update action items tab with count
    const actionItemsTab = document.querySelector('#action-items-tab');
    if (actionItemsTab) {
      actionItemsTab.textContent = `Action Items (${actionItems.length})`;
    }
  }
}

// Handle recording started
function handleRecordingStarted(meeting) {
  isRecording = true;
  currentMeeting = meeting;
  chunkCounter = 0;
  updateRecordingIndicator();
  
  // Clear previous session data
  liveTranscript = '';
  actionItems = [];
  
  // Reset transcript display
  const transcriptEl = document.getElementById('mi-live-transcript');
  if (transcriptEl) {
    transcriptEl.innerHTML = `
      <div class="mi-processing-indicator">
        <div class="mi-processing-dot"></div>
        <span>🎤 Recording started... Listening for speech (35s chunks)...</span>
      </div>
    `;
  }
  
  // Reset action items display
  const actionItemsList = document.getElementById('mi-action-items-list');
  if (actionItemsList) {
    actionItemsList.innerHTML = '<div class="mi-empty-state"><div>Action items will appear here automatically</div></div>';
  }
  
  // Reset action items tab
  const actionItemsTab = document.querySelector('#action-items-tab');
  if (actionItemsTab) {
    actionItemsTab.textContent = 'Action Items';
  }
  
  // Auto-open transcript panel
  openTranscriptPanel();
  
  showNotification('🎤 Recording started - 35-second chunks will be processed in real-time', 'success');
}

// Handle recording stopped
function handleRecordingStopped(meeting) {
  isRecording = false;
  currentMeeting = null;
  updateRecordingIndicator();
  
  // Update transcript to show completion
  const transcriptEl = document.getElementById('mi-live-transcript');
  if (transcriptEl && !transcriptEl.querySelector('.mi-empty-state')) {
    const completionDiv = document.createElement('div');
    completionDiv.className = 'mi-processing-indicator';
    completionDiv.innerHTML = `
      <div class="mi-processing-dot" style="background: #10b981;"></div>
      <span>🛑 Recording stopped. Processing final chunks...</span>
    `;
    transcriptEl.appendChild(completionDiv);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
  
  showNotification('🛑 Recording stopped - Final processing in progress', 'success');
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `mi-notification mi-notification-${type}`;
  notification.innerHTML = `
    <div class="mi-notification-content">
      <div class="mi-notification-text">${message}</div>
    </div>
  `;
  
  // Add styles if not already added
  if (!document.querySelector('#mi-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'mi-notification-styles';
    style.textContent = `
      .mi-notification {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 12px;
        padding: 16px 20px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10003;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        border-left: 4px solid #3b82f6;
        animation: slideDown 0.3s ease;
        max-width: 400px;
        min-width: 250px;
      }
      
      .mi-notification-success {
        border-left-color: #10b981;
        background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
        color: #065f46;
      }
      
      .mi-notification-error {
        border-left-color: #ef4444;
        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
        color: #991b1b;
      }
      
      .mi-notification-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .mi-notification-text {
        font-weight: 500;
      }
      
      @keyframes slideDown {
        from { transform: translate(-50%, -100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease reverse';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 4000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.type);

  switch (message.type) {
    case 'AUTH_STATUS_CHANGED':
      isAuthenticated = message.isAuthenticated;
      updateRecordingIndicator();
      break;

    case 'RECORDING_STARTED':
      handleRecordingStarted(message.meeting);
      break;

    case 'RECORDING_STOPPED':
      handleRecordingStopped(message.meeting);
      break;

    case 'TRANSCRIPT_UPDATE':
      updateLiveTranscript(message.data);
      break;

    case 'ACTION_ITEM_DETECTED':
      updateActionItems(message.data.actionItem || message.data);
      break;

    case 'CHUNK_PROCESSED':
      console.log('Chunk processed:', message.data);
      // Could add visual feedback here
      break;

    case 'PROCESSING_STATUS':
      console.log('Processing status:', message.data);
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('✅ Meeting Intelligence: Enhanced content script with real-time 35-second chunk processing initialized');