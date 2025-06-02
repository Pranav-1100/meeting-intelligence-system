// Meeting Intelligence Background Script - Manifest V3 Compatible
console.log('Meeting Intelligence: Background service worker loaded');

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000',
  WS_BASE_URL: 'ws://localhost:8000',
  SUPPORTED_PLATFORMS: [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'webex.com'
  ]
};

// Global state (background script only handles state, not media capture)
let isRecording = false;
let currentMeeting = null;
let websocket = null;
let authToken = null;
let currentTabId = null;

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Meeting Intelligence: Extension installed/updated', details.reason);
  
  // Set default settings
  chrome.storage.local.set({
    settings: {
      autoDetect: true,
      autoStart: false,
      chunkDuration: 90,
      audioQuality: 'high',
      notifications: true
    }
  });

  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Meeting Intelligence Installed',
      message: 'Extension ready! Visit meet.google.com to start recording meetings.'
    });
  }
});

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
  }
});

// Message handling - UPDATED for popup-based recording
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'GET_RECORDING_STATUS':
      sendResponse({
        isRecording,
        currentMeeting,
        isConnected: websocket && websocket.readyState === WebSocket.OPEN
      });
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

    case 'SET_AUTH_TOKEN':
      authToken = message.token;
      sendResponse({ success: true });
      break;

    case 'GET_AUTH_TOKEN':
      sendResponse({ token: authToken });
      break;

    default:
      console.log('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }
});

// Handle recording started from popup
async function handleRecordingStartedFromPopup(data, sendResponse) {
  try {
    console.log('Recording started from popup:', data.meeting);
    
    // Update state
    isRecording = true;
    currentMeeting = data.meeting;
    currentTabId = data.meeting.tabId;
    
    // Connect to WebSocket for backend communication
    try {
      await connectWebSocket();
    } catch (wsError) {
      console.warn('WebSocket connection failed:', wsError.message);
    }
    
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
    
    // Send start message to backend
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'start_meeting',
        data: currentMeeting
      }));
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
        type: 'end_meeting',
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
        text: '●'
      });
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: '#3b82f6'
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
      message: 'Meeting recording saved successfully'
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
    console.log('Received audio chunk from popup:', data.timestamp);
    
    // Send to backend via WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'audio_chunk',
        data: {
          meetingId: data.meetingId,
          audioData: data.audioData,
          timestamp: data.timestamp
        }
      }));
      console.log('Forwarded audio chunk to backend');
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

// WebSocket connection for backend communication
async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Connecting to WebSocket:', CONFIG.WS_BASE_URL);
      
      websocket = new WebSocket(CONFIG.WS_BASE_URL);
      
      const timeout = setTimeout(() => {
        if (websocket.readyState !== WebSocket.OPEN) {
          websocket.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);

      websocket.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket connected');
        
        // Authenticate if token available
        if (authToken) {
          websocket.send(JSON.stringify({
            type: 'authenticate',
            token: authToken
          }));
        }
        
        resolve();
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
      };

      websocket.onerror = (error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        reject(error);
      };

    } catch (error) {
      reject(error);
    }
  });
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
  console.log('WebSocket message received:', message.type);

  switch (message.type) {
    case 'transcript_update':
      // Forward to content script
      forwardToContentScript({
        type: 'TRANSCRIPT_UPDATE',
        data: message.data
      });
      break;

    case 'action_item_detected':
      // Forward to content script
      forwardToContentScript({
        type: 'ACTION_ITEM_DETECTED',
        data: message.data
      });
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Action Item Detected',
        message: message.data.title || 'New action item found'
      });
      break;

    case 'processing_status':
      // Forward to content script
      forwardToContentScript({
        type: 'PROCESSING_STATUS',
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

// Forward message to content script
function forwardToContentScript(message) {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, message).catch((error) => {
      console.log('Content script forwarding failed:', error.message);
    });
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  // Note: Keyboard shortcuts can't trigger tabCapture due to user gesture requirement
  // They can only trigger the popup or notify about the shortcut
  
  switch (command) {
    case 'start-recording':
    case 'stop-recording':
      // Open popup for user to manually start/stop recording
      chrome.action.openPopup();
      break;
  }
});

// Cleanup on extension restart
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension starting up, resetting state...');
  isRecording = false;
  currentMeeting = null;
  currentTabId = null;
  websocket = null;
});

// Handle extension suspend
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up...');
  
  if (websocket) {
    websocket.close();
    websocket = null;
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open main app dashboard
  chrome.tabs.create({
    url: 'http://localhost:3000/dashboard'
  });
});

console.log('✅ Background service worker initialized (MV3 compatible)');