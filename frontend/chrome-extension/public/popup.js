console.log('Meeting Intelligence: Popup script loaded');

// Configuration
const CONFIG = {
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  UPLOAD_URL: 'http://localhost:3000/meetings/upload',
  MEETINGS_URL: 'http://localhost:3000/meetings',
  SETTINGS_URL: 'http://localhost:3000/settings',
  BACKEND_URL: 'http://localhost:8000',
  SOCKETIO_URL: 'http://localhost:8000' // Socket.IO connection
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
  mediaStream: null,
  mediaRecorder: null,
  socket: null,
  audioChunks: [],
  chunkIndex: 0,
  settings: {
    autoDetect: true,
    notifications: true,
    realtimeProcessing: true
  }
};

// Initialize popup
async function initialize() {
  try {
    console.log('Initializing popup...');
    
    // Load settings
    await loadSettings();
    
    // Get current tab info
    await getCurrentTabInfo();
    
    // Get recording status from background
    await getRecordingStatus();
    
    // Check backend connection
    await checkBackendConnection();
    
    // Connect to Socket.IO
    await connectSocketIO();
    
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

// Connect to Socket.IO (not plain WebSocket)
async function connectSocketIO() {
  try {
    console.log('Connecting to Socket.IO server...');
    
    // For Chrome extension, we need to use io from CDN or bundle it
    // For now, let's use fetch to communicate with backend instead
    currentState.isConnected = await testBackendConnection();
    
  } catch (error) {
    console.error('Socket.IO connection failed:', error);
    currentState.isConnected = false;
  }
}

// Test backend connection
async function testBackendConnection() {
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/health`);
    return response.ok;
  } catch (error) {
    console.error('Backend connection test failed:', error);
    return false;
  }
}

// Check if tabCapture is available in popup context
function checkTabCaptureAPI() {
  console.log('Checking tabCapture API in popup context...');
  
  if (typeof chrome === 'undefined') {
    throw new Error('Chrome APIs not available');
  }
  
  if (!chrome.tabCapture) {
    throw new Error('chrome.tabCapture not available. Check extension permissions.');
  }
  
  if (typeof chrome.tabCapture.capture !== 'function') {
    throw new Error('chrome.tabCapture.capture function not available.');
  }
  
  console.log('✅ tabCapture API is available in popup!');
  return true;
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

// Check backend connection
async function checkBackendConnection() {
  try {
    console.log('Checking backend connection...');
    
    const response = await fetch(`${CONFIG.BACKEND_URL}/health`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      currentState.isConnected = true;
      console.log('Backend connection: OK');
    } else {
      throw new Error(`Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.log('Backend connection failed:', error);
    currentState.isConnected = false;
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

// Handle start recording - FIXED VERSION
async function handleStartRecording() {
  try {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      Starting...
    `;
    
    console.log('=== STARTING RECORDING FROM POPUP ===');
    
    // Check if we're on a meeting platform
    if (!currentState.platform) {
      throw new Error('Please navigate to a meeting platform first (Google Meet, Zoom, Teams, or Webex)');
    }
    
    // Check if we're in a meeting
    const isInMeeting = checkIfInMeeting(currentState.currentTab?.url);
    if (!isInMeeting) {
      throw new Error('Please join a meeting first before starting recording');
    }
    
    // Check tabCapture API availability in popup context
    try {
      checkTabCaptureAPI();
    } catch (apiError) {
      throw new Error(`Audio capture API not available: ${apiError.message}`);
    }
    
    console.log('Capturing tab audio from popup...');
    
    // CAPTURE AUDIO FROM POPUP (this works in MV3!)
    currentState.mediaStream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        audio: true,
        video: false
      }, (stream) => {
        if (chrome.runtime.lastError) {
          console.error('TabCapture error:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!stream) {
          reject(new Error('No audio stream received. Make sure you\'re in an active meeting.'));
          return;
        }
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          reject(new Error('No audio tracks found. The meeting may not have audio enabled.'));
          return;
        }
        
        console.log('✅ Audio stream captured successfully from popup!', {
          audioTracks: audioTracks.length,
          streamId: stream.id,
          active: stream.active
        });
        
        resolve(stream);
      });
    });
    
    // Get meeting title
    const meetingTitle = await getMeetingTitle();
    
    // Create meeting object
    const meetingData = {
      id: `meeting-${Date.now()}`,
      title: meetingTitle,
      platform: currentState.platform.name,
      url: currentState.currentTab?.url,
      startTime: Date.now(),
      tabId: currentState.currentTab?.id
    };
    
    currentState.currentMeeting = meetingData;
    currentState.isRecording = true;
    currentState.audioChunks = [];
    currentState.chunkIndex = 0;
    
    // Start media recorder
    startMediaRecorderInPopup();
    
    // Send meeting started to backend via HTTP (since WebSocket is failing)
    try {
      await sendMeetingStartToBackend(meetingData);
    } catch (error) {
      console.warn('Failed to send meeting start to backend:', error);
    }
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED_FROM_POPUP',
      data: { meeting: meetingData }
    });
    
    // Show live transcript overlay
    showLiveTranscriptOverlay();
    
    updateUI();
    showNotification('🎤 Recording started successfully!', 'success');
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    showError(error.message);
    resetStartButton();
  }
}

// Start media recorder in popup
function startMediaRecorderInPopup() {
  try {
    currentState.mediaRecorder = new MediaRecorder(currentState.mediaStream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    currentState.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        currentState.audioChunks.push(event.data);
        console.log('Audio chunk recorded:', event.data.size, 'bytes');
      }
    };
    
    currentState.mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped, processing chunks...');
      processAudioChunks();
    };
    
    currentState.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };
    
    // Start recording
    currentState.mediaRecorder.start();
    console.log('MediaRecorder started in popup');
    
    // Record in 10-second chunks for real-time processing
    setInterval(() => {
      if (currentState.isRecording && 
          currentState.mediaRecorder && 
          currentState.mediaRecorder.state === 'recording') {
        
        currentState.mediaRecorder.stop();
        
        setTimeout(() => {
          if (currentState.isRecording && 
              currentState.mediaStream && 
              currentState.mediaStream.active) {
            currentState.mediaRecorder.start();
          }
        }, 100);
      }
    }, 10000); // 10 second chunks
    
  } catch (error) {
    console.error('Failed to start MediaRecorder:', error);
    throw error;
  }
}

// Process audio chunks and send to backend
async function processAudioChunks() {
  if (currentState.audioChunks.length === 0) return;
  
  try {
    const audioBlob = new Blob(currentState.audioChunks, { type: 'audio/webm' });
    console.log('Created audio blob:', audioBlob.size, 'bytes');
    
    // Convert to base64
    const base64Audio = await blobToBase64(audioBlob);
    
    // Send to backend via HTTP POST (since WebSocket isn't working)
    const chunkData = {
      meetingId: currentState.currentMeeting?.id,
      chunkIndex: currentState.chunkIndex++,
      audioData: base64Audio,
      timestamp: Date.now(),
      size: audioBlob.size
    };
    
    try {
      await sendAudioChunkToBackend(chunkData);
      console.log('Sent audio chunk to backend:', chunkData.chunkIndex);
      
      // Update live transcript overlay
      updateLiveTranscript(`Processing chunk ${chunkData.chunkIndex}...`);
      
    } catch (error) {
      console.error('Failed to send audio chunk to backend:', error);
    }
    
    // Clear chunks for next batch
    currentState.audioChunks = [];
    
  } catch (error) {
    console.error('Failed to process audio chunks:', error);
  }
}

// Send meeting start to backend via HTTP
async function sendMeetingStartToBackend(meetingData) {
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/meetings/start-realtime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add Firebase auth token here
    },
    body: JSON.stringify({
      meeting: meetingData,
      source: 'chrome-extension'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to start meeting: ${response.status}`);
  }
  
  return response.json();
}

// Send audio chunk to backend via HTTP
async function sendAudioChunkToBackend(chunkData) {
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/meetings/audio-chunk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add Firebase auth token here
    },
    body: JSON.stringify(chunkData)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send audio chunk: ${response.status}`);
  }
  
  return response.json();
}

// Show live transcript overlay
function showLiveTranscriptOverlay() {
  // Check if overlay already exists
  let overlay = document.getElementById('live-transcript-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'live-transcript-overlay';
    overlay.innerHTML = `
      <div class="live-transcript-header">
        <div class="live-transcript-title">
          <div class="recording-indicator"></div>
          Live Transcript
        </div>
        <button class="minimize-btn" onclick="toggleTranscriptOverlay()">−</button>
      </div>
      <div class="live-transcript-content">
        <div class="transcript-text" id="transcript-text">
          🎤 Recording started... Listening for speech...
        </div>
        <div class="action-items-section">
          <h4>Action Items</h4>
          <div id="action-items-list">No action items detected yet.</div>
        </div>
      </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #live-transcript-overlay {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        max-height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        border: 1px solid rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      
      .live-transcript-header {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .live-transcript-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
      }
      
      .recording-indicator {
        width: 8px;
        height: 8px;
        background: #ef4444;
        border-radius: 50%;
        animation: pulse 2s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(0.9); }
      }
      
      .minimize-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .minimize-btn:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      
      .live-transcript-content {
        padding: 16px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .transcript-text {
        background: #f8fafc;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        font-size: 13px;
        line-height: 1.5;
        color: #374151;
        min-height: 100px;
        white-space: pre-wrap;
      }
      
      .action-items-section h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #374151;
      }
      
      #action-items-list {
        font-size: 13px;
        color: #6b7280;
      }
      
      .action-item {
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 6px;
        padding: 8px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      
      .action-item-title {
        font-weight: 500;
        color: #0c4a6e;
      }
      
      .action-item-assignee {
        color: #0369a1;
        font-size: 11px;
      }
      
      .overlay-minimized .live-transcript-content {
        display: none;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(overlay);
  }
  
  overlay.style.display = 'block';
}

// Toggle transcript overlay
window.toggleTranscriptOverlay = function() {
  const overlay = document.getElementById('live-transcript-overlay');
  const minimizeBtn = overlay.querySelector('.minimize-btn');
  
  if (overlay.classList.contains('overlay-minimized')) {
    overlay.classList.remove('overlay-minimized');
    minimizeBtn.textContent = '−';
  } else {
    overlay.classList.add('overlay-minimized');
    minimizeBtn.textContent = '+';
  }
};

// Update live transcript
function updateLiveTranscript(text) {
  const transcriptEl = document.getElementById('transcript-text');
  if (transcriptEl) {
    transcriptEl.textContent += '\n' + text;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
}

// Add action item to overlay
function addActionItemToOverlay(actionItem) {
  const actionItemsList = document.getElementById('action-items-list');
  if (actionItemsList) {
    if (actionItemsList.textContent.includes('No action items')) {
      actionItemsList.innerHTML = '';
    }
    
    const itemEl = document.createElement('div');
    itemEl.className = 'action-item';
    itemEl.innerHTML = `
      <div class="action-item-title">${actionItem.title}</div>
      ${actionItem.assignee ? `<div class="action-item-assignee">Assigned to: ${actionItem.assignee}</div>` : ''}
    `;
    actionItemsList.appendChild(itemEl);
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
    
    console.log('=== STOPPING RECORDING ===');
    
    // Stop media recorder
    if (currentState.mediaRecorder && currentState.mediaRecorder.state !== 'inactive') {
      currentState.mediaRecorder.stop();
    }
    
    // Stop media stream
    if (currentState.mediaStream) {
      currentState.mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped audio track:', track.label);
      });
      currentState.mediaStream = null;
    }
    
    // Send stop to backend
    try {
      await sendMeetingStopToBackend();
    } catch (error) {
      console.warn('Failed to send meeting stop to backend:', error);
    }
    
    // Update state
    const meeting = currentState.currentMeeting;
    currentState.isRecording = false;
    currentState.currentMeeting = null;
    currentState.mediaRecorder = null;
    
    // Hide transcript overlay
    const overlay = document.getElementById('live-transcript-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'RECORDING_STOPPED_FROM_POPUP',
      data: { meetingId: meeting?.id }
    });
    
    updateUI();
    showNotification('🛑 Recording stopped successfully!', 'success');
    
  } catch (error) {
    console.error('Failed to stop recording:', error);
    showError(error.message);
    resetStopButton();
  }
}

// Send meeting stop to backend
async function sendMeetingStopToBackend() {
  if (!currentState.currentMeeting) return;
  
  const response = await fetch(`${CONFIG.BACKEND_URL}/api/meetings/stop-realtime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meetingId: currentState.currentMeeting.id
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to stop meeting: ${response.status}`);
  }
  
  return response.json();
}

// Convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Get meeting title from current tab
async function getMeetingTitle() {
  if (!currentState.currentTab) {
    return `Meeting ${new Date().toLocaleDateString()}`;
  }
  
  try {
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
  if (currentState.isRecording) {
    elements.connectionIcon.className = 'status-icon recording';
    elements.connectionStatus.textContent = 'Recording';
    elements.connectionSubtitle.textContent = currentState.currentMeeting?.title || 'Meeting in progress';
  } else if (currentState.isConnected) {
    elements.connectionIcon.className = 'status-icon connected';
    elements.connectionStatus.textContent = 'Ready';
    elements.connectionSubtitle.textContent = 'Backend connected and ready';
  } else {
    elements.connectionIcon.className = 'status-icon disconnected';
    elements.connectionStatus.textContent = 'Backend Offline';
    elements.connectionSubtitle.textContent = 'Check if backend server is running on localhost:8000';
  }
}

// Update recording controls
function updateRecordingControls() {
  const canRecord = currentState.platform && 
                   checkIfInMeeting(currentState.currentTab?.url);
  
  if (currentState.isRecording) {
    elements.startBtn.classList.add('hidden');
    elements.stopBtn.classList.remove('hidden');
    resetStopButton();
  } else {
    elements.startBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    elements.startBtn.disabled = !canRecord;
    resetStartButton();
    
    // Update button text if not on meeting platform
    if (!currentState.platform) {
      elements.startBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/>
        </svg>
        Go to Meeting First
      `;
    } else if (!checkIfInMeeting(currentState.currentTab?.url)) {
      elements.startBtn.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/>
        </svg>
        Join Meeting First
      `;
    }
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
  
  setTimeout(() => {
    elements.error.classList.add('hidden');
  }, 5000);
}

// Show notification
function showNotification(message, type = 'info') {
  console.log(`Notification (${type}): ${message}`);
  
  // Also show Chrome notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/icon48.png',
    title: 'Meeting Intelligence',
    message: message
  });
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
      
    case 'TRANSCRIPT_UPDATE':
      updateLiveTranscript(message.data.content || message.data);
      break;
      
    case 'ACTION_ITEM_DETECTED':
      addActionItemToOverlay(message.data);
      break;
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('✅ Meeting Intelligence Popup script (with live transcript overlay) initialization complete');