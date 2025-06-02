console.log('Meeting Intelligence: Content script loaded');

// Configuration
const CONFIG = {
  OVERLAY_ID: 'meeting-intelligence-overlay',
  INDICATOR_ID: 'meeting-intelligence-indicator',
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
let currentMeeting = null;
let overlay = null;
let indicator = null;
let platform = null;
let liveTranscript = '';
let actionItems = [];

// Initialize when page loads
function initialize() {
  platform = detectPlatform();
  if (platform) {
    console.log(`Meeting Intelligence: Detected platform - ${platform.name}`);
    setupMeetingDetection();
    createRecordingIndicator();
    
    // Check if already recording
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
      if (response && response.isRecording) {
        handleRecordingStarted(response.currentMeeting);
      }
    });
  }
}

// Detect meeting platform
function detectPlatform() {
  const hostname = window.location.hostname;
  for (const [domain, config] of Object.entries(CONFIG.SUPPORTED_PLATFORMS)) {
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

// Create recording indicator
function createRecordingIndicator() {
  if (indicator) return;

  indicator = document.createElement('div');
  indicator.id = CONFIG.INDICATOR_ID;
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
      <div class="mi-indicator-status">Ready</div>
      <button class="mi-indicator-button" id="mi-record-button">
        <span class="mi-button-text">Start</span>
      </button>
    </div>
  `;

  // Add styles
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
      min-width: 200px;
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
    
    .mi-indicator-text {
      font-weight: 600;
      flex-grow: 1;
    }
    
    .mi-indicator-status {
      font-size: 12px;
      color: #6b7280;
    }
    
    .mi-indicator-button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .mi-indicator-button:hover {
      background: #2563eb;
    }
    
    .mi-indicator-button.recording {
      background: #ef4444;
      animation: pulse 2s infinite;
    }
    
    .mi-indicator-button.recording:hover {
      background: #dc2626;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .meeting-intelligence-overlay {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 350px;
      max-height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .mi-overlay-header {
      background: #f8fafc;
      padding: 16px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: between;
    }
    
    .mi-overlay-title {
      font-weight: 600;
      color: #1f2937;
      flex-grow: 1;
    }
    
    .mi-overlay-close {
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
    }
    
    .mi-overlay-close:hover {
      background: #e5e7eb;
    }
    
    .mi-overlay-content {
      height: 400px;
      overflow-y: auto;
    }
    
    .mi-transcript-section {
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .mi-section-title {
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
      font-size: 14px;
    }
    
    .mi-transcript-text {
      font-size: 13px;
      line-height: 1.5;
      color: #4b5563;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .mi-action-items {
      padding: 16px;
    }
    
    .mi-action-item {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    
    .mi-action-item-title {
      font-weight: 500;
      color: #0c4a6e;
      margin-bottom: 4px;
    }
    
    .mi-action-item-assignee {
      color: #0369a1;
      font-size: 12px;
    }
    
    .mi-empty-state {
      padding: 32px 16px;
      text-align: center;
      color: #9ca3af;
      font-size: 13px;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(indicator);

  // Add event listeners
  const recordButton = indicator.querySelector('#mi-record-button');
  recordButton.addEventListener('click', handleRecordButtonClick);
}

// Update recording indicator
function updateRecordingIndicator() {
  if (!indicator) return;

  const statusEl = indicator.querySelector('.mi-indicator-status');
  const buttonEl = indicator.querySelector('#mi-record-button');
  const buttonText = buttonEl.querySelector('.mi-button-text');

  if (isRecording) {
    statusEl.textContent = 'Recording';
    buttonText.textContent = 'Stop';
    buttonEl.classList.add('recording');
  } else {
    statusEl.textContent = 'Ready';
    buttonText.textContent = 'Start';
    buttonEl.classList.remove('recording');
  }
}

// Handle record button click
function handleRecordButtonClick() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Start recording
function startRecording() {
  const meetingTitle = getMeetingTitle();
  
  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    data: {
      title: meetingTitle,
      platform: platform.name,
      url: window.location.href
    }
  }, (response) => {
    if (response && response.success) {
      console.log('Recording started successfully');
    } else {
      console.error('Failed to start recording:', response?.error);
      showNotification('Failed to start recording', 'error');
    }
  });
}

// Stop recording
function stopRecording() {
  chrome.runtime.sendMessage({
    type: 'STOP_RECORDING'
  }, (response) => {
    if (response && response.success) {
      console.log('Recording stopped successfully');
    } else {
      console.error('Failed to stop recording:', response?.error);
      showNotification('Failed to stop recording', 'error');
    }
  });
}

// Get meeting title from page
function getMeetingTitle() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('meet.google.com')) {
    const titleEl = document.querySelector('[data-meeting-title]') || 
                   document.querySelector('h1') ||
                   document.querySelector('[role="heading"]');
    if (titleEl) return titleEl.textContent.trim();
  }
  
  if (hostname.includes('zoom.us')) {
    const titleEl = document.querySelector('.meeting-topic') ||
                   document.querySelector('.zm-modal-header-title');
    if (titleEl) return titleEl.textContent.trim();
  }
  
  if (hostname.includes('teams.microsoft.com')) {
    const titleEl = document.querySelector('[data-tid="meeting-title"]') ||
                   document.querySelector('.ts-calling-thread-header');
    if (titleEl) return titleEl.textContent.trim();
  }
  
  return `Meeting ${new Date().toLocaleDateString()}`;
}

// Create live transcript overlay
function createLiveOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = CONFIG.OVERLAY_ID;
  overlay.className = 'meeting-intelligence-overlay';
  
  overlay.innerHTML = `
    <div class="mi-overlay-header">
      <div class="mi-overlay-title">Live Transcript</div>
      <button class="mi-overlay-close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    <div class="mi-overlay-content">
      <div class="mi-transcript-section">
        <div class="mi-section-title">Transcript</div>
        <div class="mi-transcript-text" id="mi-live-transcript">
          <div class="mi-empty-state">Listening for speech...</div>
        </div>
      </div>
      <div class="mi-action-items">
        <div class="mi-section-title">Action Items</div>
        <div id="mi-action-items-list">
          <div class="mi-empty-state">No action items detected yet</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add event listeners
  const closeButton = overlay.querySelector('.mi-overlay-close');
  closeButton.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
}

// Update live transcript
function updateLiveTranscript(transcriptData) {
  if (!overlay) createLiveOverlay();
  
  const transcriptEl = overlay.querySelector('#mi-live-transcript');
  
  if (transcriptData.content) {
    liveTranscript += ' ' + transcriptData.content;
    transcriptEl.textContent = liveTranscript;
    
    // Auto scroll to bottom
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
}

// Update action items
function updateActionItems(newActionItem) {
  if (!overlay) createLiveOverlay();
  
  actionItems.push(newActionItem);
  
  const actionItemsList = overlay.querySelector('#mi-action-items-list');
  actionItemsList.innerHTML = '';
  
  if (actionItems.length === 0) {
    actionItemsList.innerHTML = '<div class="mi-empty-state">No action items detected yet</div>';
    return;
  }
  
  actionItems.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'mi-action-item';
    itemEl.innerHTML = `
      <div class="mi-action-item-title">${item.title}</div>
      ${item.assignee_name ? `<div class="mi-action-item-assignee">Assigned to: ${item.assignee_name}</div>` : ''}
    `;
    actionItemsList.appendChild(itemEl);
  });
}

// Handle recording started
function handleRecordingStarted(meeting) {
  isRecording = true;
  currentMeeting = meeting;
  updateRecordingIndicator();
  
  // Show overlay
  createLiveOverlay();
  if (overlay) {
    overlay.style.display = 'block';
  }
  
  showNotification('Recording started', 'success');
}

// Handle recording stopped
function handleRecordingStopped(meeting) {
  isRecording = false;
  currentMeeting = null;
  updateRecordingIndicator();
  
  // Hide overlay
  if (overlay) {
    overlay.style.display = 'none';
  }
  
  showNotification('Recording stopped and processing started', 'success');
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `mi-notification mi-notification-${type}`;
  notification.textContent = message;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .mi-notification {
      position: fixed;
      top: 80px;
      right: 20px;
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10002;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      border-left: 4px solid #3b82f6;
      animation: slideIn 0.3s ease;
    }
    
    .mi-notification-success {
      border-left-color: #10b981;
      background: #f0fdf4;
      color: #065f46;
    }
    
    .mi-notification-error {
      border-left-color: #ef4444;
      background: #fef2f2;
      color: #991b1b;
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  
  if (!document.querySelector('#mi-notification-styles')) {
    style.id = 'mi-notification-styles';
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  switch (message.type) {
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
      updateActionItems(message.data);
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

console.log('Meeting Intelligence: Content script initialization complete');