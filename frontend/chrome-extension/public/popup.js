console.log('Meeting Intelligence: Popup script loaded');

// Configuration
const CONFIG = {
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  UPLOAD_URL: 'http://localhost:3000/meetings/upload',
  MEETINGS_URL: 'http://localhost:3000/meetings',
  SETTINGS_URL: 'http://localhost:3000/settings',
  HELP_URL: 'https://docs.meetingintelligence.ai',
  PRIVACY_URL: 'https://meetingintelligence.ai/privacy',
  FEEDBACK_URL: 'https://meetingintelligence.ai/feedback'
};

// DOM elements
const elements = {
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  errorText: document.getElementById('error-text'),
  mainContent: document.getElementById('main-content'),
  connectionIcon: document.getElementById('connection-icon'),
  connectionStatus: document.getElementById('connection-status'),
  connectionSubtitle: document.getElementById('connection-subtitle'),
  platformInfo: document.getElementById('platform-info'),
  platformName: document.getElementById('platform-name'),
  platformUrl: document.getElementById('platform-url'),
  startBtn: document.getElementById('start-btn'),
  stopBtn: document.getElementById('stop-btn'),
  dashboardLink: document.getElementById('dashboard-link'),
  uploadLink: document.getElementById('upload-link'),
  meetingsLink: document.getElementById('meetings-link'),
  settingsLink: document.getElementById('settings-link'),
  helpLink: document.getElementById('help-link'),
  privacyLink: document.getElementById('privacy-link'),
  feedbackLink: document.getElementById('feedback-link'),
  autoDetectToggle: document.getElementById('auto-detect-toggle'),
  notificationsToggle: document.getElementById('notifications-toggle'),
  realtimeToggle: document.getElementById('realtime-toggle')
};

// State
let currentState = {
  isRecording: false,
  isConnected: false,
  currentMeeting: null,
  platform: null,
  currentTab: null,
  settings: {
    autoDetect: true,
    notifications: true,
    realtimeProcessing: true
  }
};

// Initialize popup
async function initialize() {
  try {
    // Load settings
    await loadSettings();
    
    // Get current tab info
    await getCurrentTabInfo();
    
    // Get recording status
    await getRecordingStatus();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update UI
    updateUI();
    
    // Hide loading, show main content
    elements.loading.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
    
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showError('Failed to initialize extension');
  }
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    if (result.settings) {
      currentState.settings = { ...currentState.settings, ...result.settings };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    await chrome.storage.local.set({ settings: currentState.settings });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Get current tab information
async function getCurrentTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentState.currentTab = tab;
      
      // Detect platform
      currentState.platform = detectPlatform(tab.url);
      
      // Check if in meeting
      const isInMeeting = checkIfInMeeting(tab.url);
      
      updatePlatformInfo(isInMeeting);
    }
  } catch (error) {
    console.error('Failed to get current tab:', error);
  }
}

// Detect meeting platform
function detectPlatform(url) {
  if (!url) return null;
  
  if (url.includes('meet.google.com')) return { name: 'Google Meet', domain: 'meet.google.com' };
  if (url.includes('zoom.us')) return { name: 'Zoom', domain: 'zoom.us' };
  if (url.includes('teams.microsoft.com')) return { name: 'Microsoft Teams', domain: 'teams.microsoft.com' };
  if (url.includes('webex.com')) return { name: 'Webex', domain: 'webex.com' };
  
  return null;
}

// Check if currently in a meeting
function checkIfInMeeting(url) {
  if (!url) return false;
  
  if (url.includes('meet.google.com')) {
    const pathname = new URL(url).pathname;
    return pathname.length > 1 && !pathname.includes('_meet');
  }
  
  if (url.includes('zoom.us')) {
    return url.includes('/j/') || url.includes('/wc/join/');
  }
  
  if (url.includes('teams.microsoft.com')) {
    return url.includes('/l/meetup-join/');
  }
  
  return false;
}

// Update platform info display
function updatePlatformInfo(isInMeeting) {
  if (currentState.platform && isInMeeting) {
    elements.platformInfo.classList.remove('hidden');
    elements.platformName.textContent = `${currentState.platform.name} Meeting`;
    elements.platformUrl.textContent = currentState.currentTab?.url || '';
  } else if (currentState.platform) {
    elements.platformInfo.classList.remove('hidden');
    elements.platformName.textContent = `${currentState.platform.name} (Not in meeting)`;
    elements.platformUrl.textContent = currentState.currentTab?.url || '';
  } else {
    elements.platformInfo.classList.add('hidden');
  }
}

// Get recording status from background script
async function getRecordingStatus() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
      if (response) {
        currentState.isRecording = response.isRecording;
        currentState.isConnected = response.isConnected;
        currentState.currentMeeting = response.currentMeeting;
      }
      resolve();
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  // Recording controls
  elements.startBtn.addEventListener('click', handleStartRecording);
  elements.stopBtn.addEventListener('click', handleStopRecording);
  
  // Navigation links
  elements.dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.DASHBOARD_URL);
  });
  
  elements.uploadLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.UPLOAD_URL);
  });
  
  elements.meetingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.MEETINGS_URL);
  });
  
  elements.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.SETTINGS_URL);
  });
  
  elements.helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.HELP_URL);
  });
  
  elements.privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.PRIVACY_URL);
  });
  
  elements.feedbackLink.addEventListener('click', (e) => {
    e.preventDefault();
    openUrl(CONFIG.FEEDBACK_URL);
  });
  
  // Settings toggles
  elements.autoDetectToggle.addEventListener('click', () => {
    toggleSetting('autoDetect');
  });
  
  elements.notificationsToggle.addEventListener('click', () => {
    toggleSetting('notifications');
  });
  
  elements.realtimeToggle.addEventListener('click', () => {
    toggleSetting('realtimeProcessing');
  });
}

// Handle start recording
async function handleStartRecording() {
  try {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      Starting...
    `;
    
    // Check if we're on a meeting platform
    if (!currentState.platform) {
      throw new Error('Please navigate to a meeting platform first');
    }
    
    // Get meeting title
    const meetingTitle = await getMeetingTitle();
    
    // Send start recording message
    chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      data: {
        title: meetingTitle,
        platform: currentState.platform.name,
        url: currentState.currentTab?.url
      }
    }, (response) => {
      if (response && response.success) {
        currentState.isRecording = true;
        currentState.currentMeeting = response.meeting;
        updateUI();
        showNotification('Recording started successfully', 'success');
      } else {
        const error = response?.error || 'Failed to start recording';
        showError(error);
        resetStartButton();
      }
    });
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    showError(error.message);
    resetStartButton();
  }
}

// Handle stop recording
async function handleStopRecording() {
  try {
    elements.stopBtn.disabled = true;
    elements.stopBtn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      Stopping...
    `;
    
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
      if (response && response.success) {
        currentState.isRecording = false;
        currentState.currentMeeting = null;
        updateUI();
        showNotification('Recording stopped and processing started', 'success');
      } else {
        const error = response?.error || 'Failed to stop recording';
        showError(error);
        resetStopButton();
      }
    });
    
  } catch (error) {
    console.error('Failed to stop recording:', error);
    showError(error.message);
    resetStopButton();
  }
}

// Get meeting title from current tab
async function getMeetingTitle() {
  if (!currentState.currentTab) {
    return `Meeting ${new Date().toLocaleDateString()}`;
  }
  
  try {
    // Try to get title from tab title
    let title = currentState.currentTab.title;
    
    // Clean up common prefixes/suffixes
    title = title.replace(/^Meet - /, '');
    title = title.replace(/ - Zoom$/, '');
    title = title.replace(/ \| Microsoft Teams$/, '');
    
    return title || `Meeting ${new Date().toLocaleDateString()}`;
  } catch (error) {
    return `Meeting ${new Date().toLocaleDateString()}`;
  }
}

// Reset start button
function resetStartButton() {
  elements.startBtn.disabled = false;
  elements.startBtn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/>
    </svg>
    Start Recording
  `;
}

// Reset stop button
function resetStopButton() {
  elements.stopBtn.disabled = false;
  elements.stopBtn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
    Stop
  `;
}

// Toggle setting
function toggleSetting(settingName) {
  currentState.settings[settingName] = !currentState.settings[settingName];
  saveSettings();
  updateSettingsUI();
}

// Update main UI
function updateUI() {
  updateConnectionStatus();
  updateRecordingControls();
  updateSettingsUI();
}

// Update connection status
function updateConnectionStatus() {
  if (currentState.isConnected) {
    elements.connectionIcon.className = 'status-icon connected';
    elements.connectionStatus.textContent = 'Connected';
    elements.connectionSubtitle.textContent = 'Ready for real-time processing';
  } else {
    elements.connectionIcon.className = 'status-icon disconnected';
    elements.connectionStatus.textContent = 'Disconnected';
    elements.connectionSubtitle.textContent = 'Check your internet connection';
  }
  
  if (currentState.isRecording) {
    elements.connectionIcon.className = 'status-icon recording';
    elements.connectionStatus.textContent = 'Recording';
    elements.connectionSubtitle.textContent = currentState.currentMeeting?.title || 'Meeting in progress';
  }
}

// Update recording controls
function updateRecordingControls() {
  const canRecord = currentState.platform && checkIfInMeeting(currentState.currentTab?.url);
  
  if (currentState.isRecording) {
    elements.startBtn.classList.add('hidden');
    elements.stopBtn.classList.remove('hidden');
    resetStopButton();
  } else {
    elements.startBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    elements.startBtn.disabled = !canRecord;
    resetStartButton();
  }
}

// Update settings UI
function updateSettingsUI() {
  // Auto-detect toggle
  if (currentState.settings.autoDetect) {
    elements.autoDetectToggle.classList.add('active');
  } else {
    elements.autoDetectToggle.classList.remove('active');
  }
  
  // Notifications toggle
  if (currentState.settings.notifications) {
    elements.notificationsToggle.classList.add('active');
  } else {
    elements.notificationsToggle.classList.remove('active');
  }
  
  // Real-time toggle
  if (currentState.settings.realtimeProcessing) {
    elements.realtimeToggle.classList.add('active');
  } else {
    elements.realtimeToggle.classList.remove('active');
  }
}

// Open URL in new tab
function openUrl(url) {
  chrome.tabs.create({ url });
  window.close();
}

// Show error message
function showError(message) {
  elements.error.classList.remove('hidden');
  elements.errorText.textContent = message;
  
  // Hide error after 5 seconds
  setTimeout(() => {
    elements.error.classList.add('hidden');
  }, 5000);
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .notification {
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      font-size: 12px;
      border-left: 4px solid #3b82f6;
      animation: slideDown 0.3s ease;
    }
    
    .notification-success {
      border-left-color: #10b981;
      background: #f0fdf4;
      color: #065f46;
    }
    
    .notification-error {
      border-left-color: #ef4444;
      background: #fef2f2;
      color: #991b1b;
    }
    
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.remove();
    style.remove();
  }, 3000);
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Popup received message:', message);
  
  switch (message.type) {
    case 'RECORDING_STATUS_CHANGED':
      currentState.isRecording = message.isRecording;
      currentState.currentMeeting = message.currentMeeting;
      updateUI();
      break;
      
    case 'CONNECTION_STATUS_CHANGED':
      currentState.isConnected = message.isConnected;
      updateUI();
      break;
  }
});

// Refresh status periodically
setInterval(async () => {
  await getRecordingStatus();
  updateUI();
}, 5000);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('Meeting Intelligence: Popup script initialization complete');