// Meeting Intelligence Background Script - Fixed Auth Detection
console.log('Meeting Intelligence: Background service worker loaded');

// Configuration
const CONFIG = {
  FRONTEND_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:8000',
  WS_BASE_URL: 'ws://localhost:8000',
  CHUNK_DURATION: 35000, // 35 seconds
  SUPPORTED_PLATFORMS: [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'webex.com'
  ]
};

// Global state
let isRecording = false;
let currentMeeting = null;
let websocket = null;
let authToken = null;
let currentTabId = null;
let authCheckInterval = null;

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Meeting Intelligence: Extension installed/updated', details.reason);
  
  // Set default settings
  chrome.storage.local.set({
    settings: {
      autoDetect: true,
      autoStart: false,
      chunkDuration: 35,
      audioQuality: 'high',
      notifications: true
    }
  });

  if (details.reason === 'install') {
    // Open frontend for initial setup
    chrome.tabs.create({ url: CONFIG.FRONTEND_URL });
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Meeting Intelligence Installed',
      message: 'Please log in to the dashboard to start using the extension.'
    });
  }

  // Start auth monitoring
  startAuthMonitoring();
});

// Auto-authentication from frontend - IMPROVED VERSION
async function startAuthMonitoring() {
  console.log('🔍 Starting authentication monitoring...');
  
  // Check immediately
  await checkFrontendAuth();
  
  // Check every 15 seconds
  authCheckInterval = setInterval(checkFrontendAuth, 15000);
}

// IMPROVED: Check authentication from frontend
async function checkFrontendAuth() {
  try {
    console.log('🔍 Checking frontend authentication...');
    
    // First, try to get stored token
    const stored = await chrome.storage.local.get(['authToken']);
    if (stored.authToken && stored.authToken !== authToken) {
      authToken = stored.authToken;
      console.log('✅ Found stored auth token');
      await connectWebSocket();
      broadcastAuthStatus(true);
      return;
    }
    
    // Try to get auth token from frontend tabs
    const tabs = await chrome.tabs.query({ url: `${CONFIG.FRONTEND_URL}/*` });
    
    if (tabs.length > 0) {
      console.log(`Found ${tabs.length} frontend tabs, checking for tokens...`);
      
      for (const tab of tabs) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // This runs in the frontend context
              try {
                console.log('🔍 Extension checking for auth tokens...');
                
                // Try multiple token locations
                const tokenSources = [
                  () => localStorage.getItem('firebase-token'),
                  () => localStorage.getItem('authToken'),
                  () => localStorage.getItem('auth-token'),
                  () => sessionStorage.getItem('firebase-token'),
                  () => sessionStorage.getItem('authToken'),
                ];
                
                for (const getToken of tokenSources) {
                  const token = getToken();
                  if (token && token.length > 50) {
                    console.log('🔑 Found auth token in frontend!');
                    return {
                      success: true,
                      token: token,
                      source: 'frontend-storage'
                    };
                  }
                }
                
                // Try Firebase Auth directly
                if (window.firebase && window.firebase.auth) {
                  const user = window.firebase.auth().currentUser;
                  if (user) {
                    console.log('🔑 Found Firebase user, getting token...');
                    // Return a promise that will be resolved
                    return user.getIdToken().then(token => ({
                      success: true,
                      token: token,
                      source: 'firebase-direct'
                    }));
                  }
                }
                
                return { success: false, reason: 'No tokens found' };
                
              } catch (error) {
                console.log('Error in auth check:', error);
                return { success: false, reason: error.message };
              }
            }
          });
          
          if (results && results[0] && results[0].result) {
            const result = results[0].result;
            
            // Handle promise result (for Firebase direct token)
            if (result instanceof Promise) {
              const resolvedResult = await result;
              if (resolvedResult.success && resolvedResult.token) {
                await updateAuthToken(resolvedResult.token);
                return;
              }
            } else if (result.success && result.token) {
              await updateAuthToken(result.token);
              return;
            }
          }
        } catch (error) {
          console.log(`Auth check failed for tab ${tab.id}:`, error.message);
        }
      }
    } else {
      console.log('No frontend tabs found');
    }
    
  } catch (error) {
    console.log('Auth check error:', error);
  }
}

// Update auth token
async function updateAuthToken(newToken) {
  if (newToken !== authToken) {
    authToken = newToken;
    console.log('✅ Auth token updated from frontend');
    
    // Store token securely
    await chrome.storage.local.set({ authToken });
    
    // Connect WebSocket with auth
    await connectWebSocket();
    
    // Update all popups/content scripts
    broadcastAuthStatus(true);
    
    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Authentication Successful',
      message: 'Extension is now connected to your account'
    });
  }
}

// Broadcast auth status to all contexts
function broadcastAuthStatus(isAuthenticated) {
  // Send to all content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'AUTH_STATUS_CHANGED',
        isAuthenticated,
        token: authToken
      }).catch(() => {}); // Ignore errors for tabs without content script
    });
  });
}

// WebSocket connection with authentication
async function connectWebSocket() {
  if (!authToken) {
    console.log('No auth token, skipping WebSocket connection');
    return;
  }

  try {
    console.log('Connecting to WebSocket with auth...');
    
    // Close existing connection
    if (websocket) {
      websocket.close();
    }
    
    websocket = new WebSocket(`${CONFIG.WS_BASE_URL}?token=${authToken}`);
    
    const timeout = setTimeout(() => {
      if (websocket.readyState !== WebSocket.OPEN) {
        websocket.close();
        console.log('WebSocket connection timeout');
      }
    }, 10000);

    websocket.onopen = () => {
      clearTimeout(timeout);
      console.log('✅ WebSocket connected with authentication');
      
      // Send authentication message
      websocket.send(JSON.stringify({
        type: 'authenticate',
        token: authToken
      }));
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    websocket.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      websocket = null;
      
      // Auto-reconnect after 5 seconds if authenticated
      if (authToken) {
        setTimeout(connectWebSocket, 5000);
      }
    };

    websocket.onerror = (error) => {
      clearTimeout(timeout);
      console.error('WebSocket error:', error);
    };

  } catch (error) {
    console.error('WebSocket connection failed:', error);
  }
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
  console.log('WebSocket message received:', message.type);

  switch (message.type) {
    case 'auth_success':
      console.log('✅ WebSocket authentication successful');
      break;
      
    case 'auth_failed':
      console.error('❌ WebSocket authentication failed');
      authToken = null;
      chrome.storage.local.remove(['authToken']);
      break;

    case 'transcript_update':
      forwardToContentScript({
        type: 'TRANSCRIPT_UPDATE',
        data: message.data
      });
      break;

    case 'action_item_detected':
      forwardToContentScript({
        type: 'ACTION_ITEM_DETECTED',
        data: message.data
      });
      
      // Show notification
      if (message.data.title) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: '📋 Action Item Detected',
          message: message.data.title
        });
      }
      break;

    case 'processing_status':
      forwardToContentScript({
        type: 'PROCESSING_STATUS',
        data: message.data
      });
      break;

    case 'chunk_processed':
      console.log('Audio chunk processed:', message.data);
      forwardToContentScript({
        type: 'CHUNK_PROCESSED',
        data: message.data
      });
      break;

    case 'error':
      console.error('WebSocket error message:', message.error);
      break;

    default:
      console.log('Unknown WebSocket message type:', message.type);
  }
}

// Message handling from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'GET_AUTH_STATUS':
      sendResponse({
        isAuthenticated: !!authToken,
        token: authToken,
        isConnected: websocket && websocket.readyState === WebSocket.OPEN
      });
      break;

    case 'GET_RECORDING_STATUS':
      sendResponse({
        isRecording,
        currentMeeting,
        isConnected: websocket && websocket.readyState === WebSocket.OPEN,
        isAuthenticated: !!authToken
      });
      break;

    case 'REFRESH_AUTH':
      checkFrontendAuth();
      sendResponse({ success: true });
      break;

    case 'SET_AUTH_TOKEN':
      // Handle token from auth bridge
      if (message.token && message.token !== authToken) {
        updateAuthToken(message.token);
      }
      sendResponse({ success: true });
      break;

    case 'RECORDING_STARTED_FROM_POPUP':
      handleRecordingStartedFromPopup(message.data, sendResponse);
      return true; // Keep message channel open

    case 'RECORDING_STOPPED_FROM_POPUP':
      handleRecordingStoppedFromPopup(message.data, sendResponse);
      return true;

    case 'AUDIO_CHUNK_FROM_POPUP':
      handleAudioChunkFromPopup(message.data, sendResponse);
      break;

    case 'LOGOUT':
      handleLogout();
      sendResponse({ success: true });
      break;

    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// Handle logout
async function handleLogout() {
  authToken = null;
  await chrome.storage.local.remove(['authToken']);
  
  if (websocket) {
    websocket.close();
    websocket = null;
  }
  
  // Stop any recording
  if (isRecording) {
    isRecording = false;
    currentMeeting = null;
  }
  
  broadcastAuthStatus(false);
}

// Handle recording started from popup
async function handleRecordingStartedFromPopup(data, sendResponse) {
  try {
    if (!authToken) {
      throw new Error('Not authenticated. Please log in first.');
    }

    console.log('Recording started from popup:', data.meeting);
    
    // Update state
    isRecording = true;
    currentMeeting = data.meeting;
    currentTabId = data.meeting.tabId;
    
    // Update badge
    if (currentTabId) {
      chrome.action.setBadgeText({
        tabId: currentTabId,
        text: 'REC'
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: currentTabId,
        color: '#ef4444'
      });
    }
    
    // Send start message to backend via WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'start_recording',
        data: {
          meeting: currentMeeting,
          chunkDuration: CONFIG.CHUNK_DURATION
        }
      }));
    } else {
      console.warn('WebSocket not connected, cannot start recording');
    }
    
    // Notify content script
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {
        type: 'RECORDING_STARTED',
        meeting: currentMeeting
      }).catch((error) => {
        console.log('Content script notification failed:', error.message);
      });
    }
    
    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Recording Started ✅',
      message: `Recording: ${currentMeeting.title}`
    });
    
    sendResponse({ success: true });
    
  } catch (error) {
    console.error('Failed to handle recording start:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle recording stopped from popup  
async function handleRecordingStoppedFromPopup(data, sendResponse) {
  try {
    console.log('Recording stopped from popup:', data.meetingId);
    
    // Send stop message to backend
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'stop_recording',
        data: { meetingId: data.meetingId }
      }));
    }
    
    // Save meeting reference
    const meeting = currentMeeting;
    
    // Reset state
    isRecording = false;
    currentMeeting = null;
    const tabId = currentTabId;
    currentTabId = null;
    
    // Update badge
    if (tabId) {
      chrome.action.setBadgeText({
        tabId,
        text: ''
      });
    }
    
    // Notify content script
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'RECORDING_STOPPED',
        meeting
      }).catch((error) => {
        console.log('Content script notification failed:', error.message);
      });
    }
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Recording Stopped ⏹️',
      message: 'Meeting recording saved and processing...'
    });
    
    sendResponse({ success: true, meeting });
    
  } catch (error) {
    console.error('Failed to handle recording stop:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle audio chunk from popup
function handleAudioChunkFromPopup(data, sendResponse) {
  try {
    console.log('Received audio chunk from popup:', data.chunkIndex, 'size:', data.size);
    
    if (!authToken) {
      console.warn('No auth token, cannot send audio chunk');
      if (sendResponse) sendResponse({ success: false, error: 'Not authenticated' });
      return;
    }
    
    // Send to backend via WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'audio_chunk',
        data: {
          meetingId: data.meetingId,
          chunkIndex: data.chunkIndex,
          audioData: data.audioData,
          timestamp: data.timestamp,
          size: data.size
        }
      }));
      console.log('✅ Forwarded audio chunk to backend');
    } else {
      console.warn('WebSocket not available, audio chunk not sent');
    }
    
    if (sendResponse) {
      sendResponse({ success: true });
    }
    
  } catch (error) {
    console.error('Failed to handle audio chunk:', error);
    if (sendResponse) {
      sendResponse({ success: false, error: error.message });
    }
  }
}

// Forward message to content script
function forwardToContentScript(message) {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, message).catch((error) => {
      console.log('Content script forwarding failed:', error.message);
    });
  }
}

// Detect meeting platforms and inject content scripts
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isMeetingPlatform = CONFIG.SUPPORTED_PLATFORMS.some(platform => 
      tab.url.includes(platform)
    );

    if (isMeetingPlatform) {
      console.log('Meeting platform detected:', tab.url);
      
      try {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        
        // Update badge
        chrome.action.setBadgeText({
          tabId,
          text: isRecording ? 'REC' : '●'
        });
        chrome.action.setBadgeBackgroundColor({
          tabId,
          color: isRecording ? '#ef4444' : '#3b82f6'
        });
        
      } catch (error) {
        console.log('Content script injection failed:', error.message);
      }
    }
    
    // Inject auth bridge on frontend pages
    if (tab.url && tab.url.includes(CONFIG.FRONTEND_URL)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['auth-bridge.js']
        });
        console.log('✅ Auth bridge injected into frontend');
      } catch (error) {
        console.log('Auth bridge injection failed:', error.message);
      }
    }
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  switch (command) {
    case 'start-recording':
    case 'stop-recording':
      // Open popup for user to manually start/stop recording
      chrome.action.openPopup();
      break;
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open main app dashboard
  chrome.tabs.create({
    url: CONFIG.FRONTEND_URL
  });
});

// Cleanup on extension events
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension starting up...');
  startAuthMonitoring();
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up...');
  
  if (authCheckInterval) {
    clearInterval(authCheckInterval);
  }
  
  if (websocket) {
    websocket.close();
    websocket = null;
  }
});

console.log('✅ Background service worker initialized with improved authentication');