console.log('Meeting Intelligence: Popup script with FIXED authentication loaded');

// Configuration
const CONFIG = {
  DASHBOARD_URL: 'http://localhost:3000/dashboard',
  LOGIN_URL: 'http://localhost:3000/login',
  BACKEND_URL: 'http://localhost:8000',
  CHUNK_DURATION: 35000, // 35 seconds
  RECORDING_TIMEOUT: 4 * 60 * 60 * 1000 // 4 hours max recording
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
  stopBtn: document.getElementById('stop-btn')
};

// State
let currentState = {
  isRecording: false,
  isConnected: false,
  isAuthenticated: false,
  authToken: null,
  userInfo: null,
  currentMeeting: null,
  platform: null,
  currentTab: null,
  mediaStream: null,
  mediaRecorder: null,
  audioChunks: [],
  chunkIndex: 0,
  recordingStartTime: null,
  chunkInterval: null,
  settings: {
    autoDetect: true,
    notifications: true,
    realtimeProcessing: true
  }
};

// Initialize popup
async function initialize() {
  try {
    console.log('🚀 Initializing popup with FIXED authentication...');
    
    // Load settings
    await loadSettings();
    
    // Check authentication status from multiple sources
    await checkAuthenticationStatus();
    
    // If not authenticated, show login prompt
    if (!currentState.isAuthenticated) {
      showLoginPrompt();
      return;
    }
    
    // Get current tab info
    await getCurrentTabInfo();
    
    // Get recording status from background
    await getRecordingStatus();
    
    // Check backend connection
    await checkBackendConnection();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update UI
    updateUI();
    
    // Hide loading, show main content
    elements.loading.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
    
    console.log('✅ Popup initialization complete');
    
  } catch (error) {
    console.error('❌ Failed to initialize popup:', error);
    showError('Failed to initialize extension');
  }
}

// FIXED: Check authentication from multiple sources
async function checkAuthenticationStatus() {
  try {
    console.log('🔐 Checking authentication status from multiple sources...');
    
    // Method 1: Check chrome.storage.local (extension storage)
    let foundToken = await checkExtensionStorage();
    
    // Method 2: Check website localStorage (if on same domain)
    if (!foundToken) {
      foundToken = await checkWebsiteStorage();
    }
    
    // Method 3: Listen for postMessage from website
    setupPostMessageListener();
    
    if (foundToken) {
      // Verify token with backend
      const isValid = await verifyTokenWithBackend(currentState.authToken);
      if (!isValid) {
        console.log('⚠️ Token invalid on backend, clearing...');
        await clearAllAuthData();
        currentState.isAuthenticated = false;
      }
    }
    
  } catch (error) {
    console.error('❌ Authentication check failed:', error);
    currentState.isAuthenticated = false;
  }
}

// Check extension storage (chrome.storage.local)
async function checkExtensionStorage() {
  try {
    const result = await chrome.storage.local.get(['authToken', 'userInfo', 'tokenExpiry']);
    
    if (result.authToken && result.tokenExpiry) {
      const now = Date.now();
      const expiry = result.tokenExpiry;
      
      if (now < expiry) {
        console.log('✅ Valid token found in extension storage');
        currentState.authToken = result.authToken;
        currentState.userInfo = result.userInfo;
        currentState.isAuthenticated = true;
        return true;
      } else {
        console.log('⏰ Token expired in extension storage, clearing...');
        await chrome.storage.local.remove(['authToken', 'userInfo', 'tokenExpiry']);
      }
    }
    
    return false;
  } catch (error) {
    console.error('Failed to check extension storage:', error);
    return false;
  }
}

// FIXED: Check website localStorage (read from website's localStorage)
async function checkWebsiteStorage() {
  try {
    // Method 1: Try to read from current tab if it's our website
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes('localhost:3000')) {
      console.log('🌐 On website tab, checking localStorage...');
      
      // Execute script in the website's context to read localStorage
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // This runs in the website's context
          return {
            authToken: localStorage.getItem('authToken') || localStorage.getItem('firebase-token'),
            userInfo: JSON.parse(localStorage.getItem('userInfo') || 'null'),
            timestamp: Date.now()
          };
        }
      });
      
      if (results && results[0] && results[0].result && results[0].result.authToken) {
        const data = results[0].result;
        console.log('✅ Token found in website localStorage!');
        
        // Store in extension storage for future use
        await chrome.storage.local.set({
          authToken: data.authToken,
          userInfo: data.userInfo,
          tokenExpiry: Date.now() + (60 * 60 * 1000), // 1 hour
          tokenSource: 'website-localStorage'
        });
        
        currentState.authToken = data.authToken;
        currentState.userInfo = data.userInfo;
        currentState.isAuthenticated = true;
        
        console.log('💾 Token copied to extension storage');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Failed to check website storage:', error);
    return false;
  }
}

// FIXED: Setup postMessage listener for real-time token updates
function setupPostMessageListener() {
  console.log('📡 Setting up postMessage listener...');
  
  // Listen for messages from website
  window.addEventListener('message', async (event) => {
    try {
      // Security: Only accept messages from our website
      if (!event.origin.includes('localhost:3000')) {
        return;
      }
      
      if (event.data && event.data.type === 'MEETING_INTELLIGENCE_AUTH_UPDATE') {
        console.log('📨 Received auth update from website:', event.data);
        
        if (event.data.token && event.data.user) {
          // Token received from website
          console.log('✅ New token received via postMessage!');
          
          await chrome.storage.local.set({
            authToken: event.data.token,
            userInfo: event.data.user,
            tokenExpiry: Date.now() + (60 * 60 * 1000), // 1 hour
            tokenSource: 'website-postMessage'
          });
          
          currentState.authToken = event.data.token;
          currentState.userInfo = event.data.user;
          currentState.isAuthenticated = true;
          
          // Refresh the popup UI
          console.log('🔄 Refreshing popup after auth update...');
          await initialize();
          
        } else if (event.data.token === null) {
          // Logout received from website
          console.log('🚪 Logout received via postMessage');
          await clearAllAuthData();
          currentState.isAuthenticated = false;
          
          // Refresh UI to show login prompt
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Error handling postMessage:', error);
    }
  });
}

// Verify token with backend
async function verifyTokenWithBackend(token) {
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      currentState.userInfo = userData.user;
      console.log('✅ Token verified with backend');
      return true;
    } else {
      console.log('❌ Token verification failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
}

// Clear authentication data from all sources
async function clearAllAuthData() {
  try {
    // Clear extension storage
    await chrome.storage.local.remove(['authToken', 'userInfo', 'tokenExpiry']);
    
    // Clear website storage (if on website tab)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('localhost:3000')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            localStorage.removeItem('authToken');
            localStorage.removeItem('firebase-token');
            localStorage.removeItem('userInfo');
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('firebase-token');
          }
        });
        console.log('🧹 Cleared website storage');
      } catch (error) {
        console.log('Could not clear website storage:', error.message);
      }
    }
    
    // Reset state
    currentState.authToken = null;
    currentState.userInfo = null;
    currentState.isAuthenticated = false;
    
    console.log('🧹 All auth data cleared');
  } catch (error) {
    console.error('Failed to clear auth data:', error);
  }
}

// Show login prompt with improved messaging
function showLoginPrompt() {
  console.log('🔑 Showing login prompt...');
  
  // Hide loading and main content
  elements.loading.classList.add('hidden');
  elements.mainContent.classList.add('hidden');
  
  // Create login prompt
  const loginPrompt = document.createElement('div');
  loginPrompt.id = 'login-prompt';
  loginPrompt.innerHTML = `
    <div class="login-container">
      <div class="login-header">
        <h2>🔐 Sign In Required</h2>
        <p>Connect your Meeting Intelligence account</p>
      </div>
      
      <div class="login-content">
        <div class="login-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="#3b82f6">
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V9C3 10.1 3.9 11 5 11V19C5 20.1 5.9 21 7 21H17C18.1 21 19 20.1 19 19V11C20.1 11 21 10.1 21 9Z"/>
          </svg>
        </div>
        
        <div class="login-message">
          <p><strong>Quick Setup:</strong></p>
          <ol>
            <li>Click "Sign In" to open the website</li>
            <li>Complete authentication (Google/Email)</li>
            <li>Return here and click "Check Status"</li>
            <li>Start recording meetings!</li>
          </ol>
        </div>
        
        <div class="login-actions">
          <button id="login-btn" class="btn btn-primary login-btn">
            <svg class="btn-icon" viewBox="0 0 24 24">
              <path d="M10,17V14H3V10H10V7L15,12L10,17M10,2H19A2,2 0 0,1 21,4V20A2,2 0 0,1 19,22H10A2,2 0 0,1 8,20V18H10V20H19V4H10V6H8V4A2,2 0 0,1 10,2Z"/>
            </svg>
            Sign In on Website
          </button>
          
          <button id="refresh-btn" class="btn btn-secondary">
            <svg class="btn-icon" viewBox="0 0 24 24">
              <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
            </svg>
            Check Status
          </button>
          
          <button id="force-check-btn" class="btn btn-outline">
            <svg class="btn-icon" viewBox="0 0 24 24">
              <path d="M12,4V2C13.3,2 14.6,2.3 15.8,2.7L14.9,4.3C14,4.1 13,4 12,4M21,10.5C21,9.2 20.7,7.9 20.3,6.7L18.7,7.6C18.9,8.5 19,9.5 19,10.5M20.3,17.3C20.7,16.1 21,14.8 21,13.5H19C19,14.5 18.9,15.5 18.7,16.4L20.3,17.3M15.8,21.3C14.6,21.7 13.3,22 12,22V20C13,20 14,19.9 14.9,19.7L15.8,21.3M6.7,20.3C7.9,20.7 9.2,21 10.5,21V19C9.5,19 8.5,18.9 7.6,18.7L6.7,20.3M2.7,15.8C2.3,14.6 2,13.3 2,12H4C4,13 4.1,14 4.3,14.9L2.7,15.8M4.3,9.1C4.1,8.5 4,7.5 4,6.5H2C2,7.8 2.3,9.1 2.7,10.3L4.3,9.1M2,12H4C4,10.5 4.3,9.2 4.7,7.9L3.1,7C2.7,8.1 2.4,9.1 2,10.1"/>
            </svg>
            Force Refresh
          </button>
        </div>
        
        <div class="login-help">
          <p><small>💡 Having trouble? Try "Force Refresh" after signing in</small></p>
        </div>
      </div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #login-prompt {
      padding: 20px;
      text-align: center;
      min-height: 400px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .login-container {
      width: 100%;
      max-width: 320px;
    }
    
    .login-header h2 {
      font-size: 18px;
      margin-bottom: 8px;
      color: #1f2937;
    }
    
    .login-header p {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 24px;
    }
    
    .login-icon {
      margin-bottom: 20px;
    }
    
    .login-message {
      background: #f3f4f6;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      text-align: left;
    }
    
    .login-message p {
      font-size: 14px;
      color: #374151;
      margin-bottom: 12px;
    }
    
    .login-message ol {
      font-size: 13px;
      color: #6b7280;
      padding-left: 20px;
    }
    
    .login-message li {
      margin-bottom: 4px;
    }
    
    .login-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .login-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      border: none;
      padding: 14px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    
    .login-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    
    .btn-outline {
      background: transparent;
      color: #3b82f6;
      border: 1px solid #3b82f6;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    
    .btn-outline:hover {
      background: #3b82f6;
      color: white;
    }
    
    .btn-icon {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    
    .login-help {
      font-size: 12px;
      color: #9ca3af;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(loginPrompt);
  
  // Setup event listeners
  document.getElementById('login-btn').addEventListener('click', () => {
    openLoginPage();
  });
  
  document.getElementById('refresh-btn').addEventListener('click', () => {
    refreshAuthStatus();
  });
  
  document.getElementById('force-check-btn').addEventListener('click', () => {
    forceRefreshAuth();
  });
}

// Open login page
function openLoginPage() {
  console.log('🌐 Opening login page...');
  
  chrome.tabs.create({ 
    url: `${CONFIG.LOGIN_URL}?source=extension` 
  });
  
  showNotification('Complete sign-in on the website, then click "Check Status"', 'info');
}

// Refresh authentication status
async function refreshAuthStatus() {
  console.log('🔄 Refreshing authentication status...');
  
  try {
    const refreshBtn = document.getElementById('refresh-btn');
    const originalText = refreshBtn.innerHTML;
    refreshBtn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      Checking...
    `;
    refreshBtn.disabled = true;
    
    // Re-check auth status
    await checkAuthenticationStatus();
    
    if (currentState.isAuthenticated) {
      // Remove login prompt and reinitialize
      const loginPrompt = document.getElementById('login-prompt');
      if (loginPrompt) {
        loginPrompt.remove();
      }
      
      // Continue with normal initialization
      await getCurrentTabInfo();
      await getRecordingStatus();
      await checkBackendConnection();
      setupEventListeners();
      updateUI();
      
      elements.loading.classList.add('hidden');
      elements.mainContent.classList.remove('hidden');
      
      showNotification('✅ Successfully signed in!', 'success');
      
    } else {
      refreshBtn.innerHTML = originalText;
      refreshBtn.disabled = false;
      showNotification('❌ Not signed in yet. Please complete sign-in first.', 'error');
    }
    
  } catch (error) {
    console.error('❌ Refresh auth status failed:', error);
    showNotification('❌ Failed to check authentication status', 'error');
  }
}

// Force refresh - checks all sources again
async function forceRefreshAuth() {
  console.log('🔄 Force refreshing all auth sources...');
  
  try {
    const forceBtn = document.getElementById('force-check-btn');
    const originalText = forceBtn.innerHTML;
    forceBtn.innerHTML = `
      <div class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></div>
      Scanning...
    `;
    forceBtn.disabled = true;
    
    // Clear current state
    currentState.isAuthenticated = false;
    currentState.authToken = null;
    currentState.userInfo = null;
    
    // Check all sources again
    await checkExtensionStorage();
    if (!currentState.isAuthenticated) {
      await checkWebsiteStorage();
    }
    
    // Try to get fresh token from website
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('localhost:3000')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Force refresh token and re-send postMessage
            if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
              window.firebase.auth().currentUser.getIdToken(true).then(token => {
                localStorage.setItem('authToken', token);
                window.postMessage({
                  type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
                  token: token,
                  user: {
                    uid: window.firebase.auth().currentUser.uid,
                    email: window.firebase.auth().currentUser.email,
                    displayName: window.firebase.auth().currentUser.displayName
                  },
                  timestamp: Date.now()
                }, '*');
                console.log('🔄 Force refreshed token and sent postMessage');
              });
            }
          }
        });
      } catch (error) {
        console.log('Could not force refresh from website:', error.message);
      }
    }
    
    // Wait a moment for postMessage
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (currentState.isAuthenticated) {
      // Success - reload popup
      window.location.reload();
    } else {
      forceBtn.innerHTML = originalText;
      forceBtn.disabled = false;
      showNotification('❌ Still not authenticated. Try signing in again.', 'error');
    }
    
  } catch (error) {
    console.error('❌ Force refresh failed:', error);
    showNotification('❌ Force refresh failed', 'error');
  }
}

// [Rest of the functions remain the same as the working version...]

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

// Check backend connection
async function checkBackendConnection() {
  try {
    console.log('🔗 Checking backend connection...');
    
    const response = await fetch(`${CONFIG.BACKEND_URL}/health`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      currentState.isConnected = true;
      console.log('✅ Backend connection: OK');
    } else {
      throw new Error(`Backend responded with ${response.status}`);
    }
  } catch (error) {
    console.log('❌ Backend connection failed:', error.message);
    currentState.isConnected = false;
  }
}

// Get current tab information
async function getCurrentTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentState.currentTab = tab;
      currentState.platform = detectPlatform(tab.url);
      updatePlatformInfo(checkIfInMeeting(tab.url));
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
  elements.startBtn.addEventListener('click', handleStartRecording);
  elements.stopBtn.addEventListener('click', handleStopRecording);
}

// Handle start recording (same as before but with proper auth)
async function handleStartRecording() {
  try {
    elements.startBtn.disabled = true;
    elements.startBtn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      Starting...
    `;
    
    console.log('🎙️ === STARTING RECORDING (WITH FIXED AUTH) ===');
    
    // Double-check authentication
    if (!currentState.isAuthenticated || !currentState.authToken) {
      throw new Error('Not authenticated. Please sign in first.');
    }
    
    // Validation checks
    if (!currentState.platform) {
      throw new Error('Please navigate to a meeting platform first');
    }
    
    if (!checkIfInMeeting(currentState.currentTab?.url)) {
      throw new Error('Please join a meeting first');
    }
    
    if (!currentState.isConnected) {
      throw new Error('Backend server is not connected');
    }

    // Check tabCapture API
    if (!chrome.tabCapture || !chrome.tabCapture.capture) {
      throw new Error('Audio capture API not available');
    }
    
    console.log('🎤 Capturing tab audio...');
    
    // Capture audio stream
    currentState.mediaStream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        audio: true,
        video: false
      }, (stream) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!stream || stream.getAudioTracks().length === 0) {
          reject(new Error('No audio stream received'));
          return;
        }
        
        console.log('✅ Audio stream captured!');
        resolve(stream);
      });
    });
    
    // Create meeting object
    const meetingData = {
      id: `meeting-${Date.now()}`,
      title: await getMeetingTitle(),
      platform: currentState.platform.name,
      url: currentState.currentTab?.url,
      startTime: Date.now(),
      tabId: currentState.currentTab?.id,
      userId: currentState.userInfo?.uid || 'unknown'
    };
    
    // Send meeting start to backend WITH AUTH TOKEN
    console.log('🚀 Starting meeting session...');
    await sendMeetingStartToBackend(meetingData);
    
    // Update state and start recording
    currentState.currentMeeting = meetingData;
    currentState.isRecording = true;
    currentState.audioChunks = [];
    currentState.chunkIndex = 0;
    currentState.recordingStartTime = Date.now();
    
    startChunkedRecording();
    showLiveTranscriptOverlay();
    
    updateUI();
    showNotification('🎤 Recording started successfully!', 'success');
    
  } catch (error) {
    console.error('❌ Failed to start recording:', error);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      showError('Authentication expired. Please sign in again.');
      await clearAllAuthData();
      setTimeout(() => window.location.reload(), 2000);
    } else {
      showError(error.message);
    }
    
    resetStartButton();
  }
}

// Send meeting start with proper auth
async function sendMeetingStartToBackend(meetingData) {
  try {
    const response = await fetch(`${CONFIG.BACKEND_URL}/api/meetings/start-realtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentState.authToken}`
      },
      body: JSON.stringify({
        meeting: meetingData,
        chunkDuration: CONFIG.CHUNK_DURATION / 1000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      
      if (response.status === 401) {
        await clearAllAuthData();
        throw new Error('Authentication expired. Please sign in again.');
      }
      
      throw new Error(`Failed to start meeting: ${response.status} - ${errorData}`);
    }
    
    const result = await response.json();
    console.log('✅ Meeting started:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Failed to send meeting start:', error);
    throw error;
  }
}

// [Include remaining functions from the working version...]

// Utility functions
function updateUI() {
  updateConnectionStatus();
  updateRecordingControls();
}

function updateConnectionStatus() {
  if (!currentState.isAuthenticated) {
    elements.connectionIcon.className = 'status-icon disconnected';
    elements.connectionStatus.textContent = 'Not Signed In';
    elements.connectionSubtitle.textContent = 'Authentication required';
  } else if (currentState.isRecording) {
    elements.connectionIcon.className = 'status-icon recording';
    elements.connectionStatus.textContent = 'Recording';
    elements.connectionSubtitle.textContent = currentState.currentMeeting?.title || 'Recording in progress';
  } else if (currentState.isConnected) {
    elements.connectionIcon.className = 'status-icon connected';
    elements.connectionStatus.textContent = 'Ready';
    elements.connectionSubtitle.textContent = `Signed in as ${currentState.userInfo?.email || 'user'}`;
  } else {
    elements.connectionIcon.className = 'status-icon disconnected';
    elements.connectionStatus.textContent = 'Backend Offline';
    elements.connectionSubtitle.textContent = 'Start backend: npm run dev';
  }
}

function updateRecordingControls() {
  const canRecord = currentState.isAuthenticated && 
                   currentState.platform && 
                   checkIfInMeeting(currentState.currentTab?.url) &&
                   currentState.isConnected;
  
  if (currentState.isRecording) {
    elements.startBtn.classList.add('hidden');
    elements.stopBtn.classList.remove('hidden');
  } else {
    elements.startBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    elements.startBtn.disabled = !canRecord;
    
    if (!currentState.isAuthenticated) {
      elements.startBtn.innerHTML = '<span>Sign In Required</span>';
    } else if (!currentState.isConnected) {
      elements.startBtn.innerHTML = '<span>Backend Offline</span>';
    } else if (!currentState.platform) {
      elements.startBtn.innerHTML = '<span>Go to Meeting Platform</span>';
    } else if (!checkIfInMeeting(currentState.currentTab?.url)) {
      elements.startBtn.innerHTML = '<span>Join Meeting First</span>';
    } else {
      elements.startBtn.innerHTML = '<span>🎤 Start Recording</span>';
    }
  }
}

function showError(message) {
  elements.error.classList.remove('hidden');
  elements.errorText.textContent = message;
  setTimeout(() => elements.error.classList.add('hidden'), 7000);
}

function showNotification(message, type = 'info') {
  console.log(`${type.toUpperCase()}: ${message}`);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '/icons/icon48.png',
    title: 'Meeting Intelligence',
    message: message
  });
}

function resetStartButton() {
  elements.startBtn.disabled = false;
  elements.startBtn.innerHTML = '<span>🎤 Start Recording</span>';
}

async function getMeetingTitle() {
  try {
    let title = currentState.currentTab?.title || '';
    title = title.replace(/^Meet - /, '').replace(/ - Zoom$/, '').replace(/ \| Microsoft Teams$/, '');
    return title || `Meeting ${new Date().toLocaleDateString()}`;
  } catch (error) {
    return `Meeting ${new Date().toLocaleDateString()}`;
  }
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log('✅ Fixed popup with multi-source auth initialized');
