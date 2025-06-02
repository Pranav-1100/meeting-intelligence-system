console.log('Meeting Intelligence: Background script loaded');

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000',
  WS_BASE_URL: 'ws://localhost:8000',
  CHUNK_DURATION: 90, // seconds
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
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let chunkIndex = 0;
let websocket = null;
let authToken = null;

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Meeting Intelligence: Extension installed/updated', details);
  
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

  // Show welcome notification
  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Meeting Intelligence',
      message: 'Extension installed! Visit a meeting platform to get started.'
    });
  }
});

// Handle tab updates to detect meeting platforms
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isMeetingPlatform = CONFIG.SUPPORTED_PLATFORMS.some(platform => 
      tab.url.includes(platform)
    );

    if (isMeetingPlatform) {
      console.log('Meeting Intelligence: Meeting platform detected', tab.url);
      
      // Inject content script if needed
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
      } catch (error) {
        console.log('Content script already injected or failed:', error);
      }

      // Update badge
      chrome.action.setBadgeText({
        tabId,
        text: isRecording ? 'REC' : '●'
      });
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: isRecording ? '#ef4444' : '#3b82f6'
      });
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  switch (message.type) {
    case 'GET_RECORDING_STATUS':
      sendResponse({
        isRecording,
        currentMeeting,
        isConnected: websocket && websocket.readyState === WebSocket.OPEN
      });
      break;

    case 'START_RECORDING':
      handleStartRecording(message.data, sendResponse);
      return true; // Async response

    case 'STOP_RECORDING':
      handleStopRecording(sendResponse);
      return true; // Async response

    case 'SET_AUTH_TOKEN':
      authToken = message.token;
      sendResponse({ success: true });
      break;

    case 'GET_AUTH_TOKEN':
      sendResponse({ token: authToken });
      break;

    case 'DETECT_MEETING_PLATFORM':
      if (sender.tab) {
        const platform = detectPlatform(sender.tab.url);
        sendResponse({ platform });
      }
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
});

// Detect meeting platform from URL
function detectPlatform(url) {
  if (url.includes('meet.google.com')) return 'google-meet';
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('teams.microsoft.com')) return 'teams';
  if (url.includes('webex.com')) return 'webex';
  return 'unknown';
}

// Start recording
async function handleStartRecording(data, sendResponse) {
  try {
    if (isRecording) {
      throw new Error('Recording already in progress');
    }

    console.log('Starting recording with data:', data);

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Start tab capture
    mediaStream = await chrome.tabCapture.capture({
      audio: true,
      video: false
    });

    if (!mediaStream) {
      throw new Error('Failed to capture tab audio');
    }

    // Connect to WebSocket
    await connectWebSocket();

    // Start media recorder
    startMediaRecorder();

    // Update state
    isRecording = true;
    currentMeeting = {
      id: `meeting-${Date.now()}`,
      title: data.title || `Meeting ${new Date().toLocaleDateString()}`,
      platform: detectPlatform(tab.url),
      startTime: Date.now(),
      tabId: tab.id
    };

    // Update badge
    chrome.action.setBadgeText({
      tabId: tab.id,
      text: 'REC'
    });
    chrome.action.setBadgeBackgroundColor({
      tabId: tab.id,
      color: '#ef4444'
    });

    // Send start message to backend
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'start_meeting',
        data: currentMeeting
      }));
    }

    // Notify content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'RECORDING_STARTED',
      meeting: currentMeeting
    });

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Recording Started',
      message: `Recording meeting: ${currentMeeting.title}`
    });

    sendResponse({ success: true, meeting: currentMeeting });

  } catch (error) {
    console.error('Failed to start recording:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Stop recording
async function handleStopRecording(sendResponse) {
  try {
    if (!isRecording) {
      throw new Error('No recording in progress');
    }

    console.log('Stopping recording');

    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }

    // Stop media stream
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    // Send stop message to backend
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'end_meeting',
        data: { meetingId: currentMeeting.id }
      }));
    }

    // Update state
    const meeting = currentMeeting;
    isRecording = false;
    currentMeeting = null;

    // Update badge
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.action.setBadgeText({
        tabId: tab.id,
        text: '●'
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: tab.id,
        color: '#3b82f6'
      });

      // Notify content script
      chrome.tabs.sendMessage(tab.id, {
        type: 'RECORDING_STOPPED',
        meeting
      });
    }

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Recording Stopped',
      message: 'Meeting recording saved and processing started'
    });

    sendResponse({ success: true, meeting });

  } catch (error) {
    console.error('Failed to stop recording:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Start media recorder
function startMediaRecorder() {
  audioChunks = [];
  chunkIndex = 0;

  mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType: 'audio/webm;codecs=opus'
  });

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });

  mediaRecorder.addEventListener('stop', () => {
    console.log('Media recorder stopped');
    processAudioChunks();
  });

  // Start recording with time slices
  mediaRecorder.start(CONFIG.CHUNK_DURATION * 1000);

  // Handle continuous recording with chunks
  setInterval(() => {
    if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setTimeout(() => {
        if (isRecording && mediaStream) {
          startMediaRecorder();
        }
      }, 100);
    }
  }, CONFIG.CHUNK_DURATION * 1000);
}

// Process audio chunks
async function processAudioChunks() {
  if (audioChunks.length === 0) return;

  try {
    // Create blob from chunks
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    // Convert to base64
    const base64Audio = await blobToBase64(audioBlob);

    // Send to backend via WebSocket
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'audio_chunk',
        data: {
          meetingId: currentMeeting?.id,
          chunkIndex: chunkIndex++,
          audioData: base64Audio,
          timestamp: Date.now()
        }
      }));
    }

    // Clear chunks for next batch
    audioChunks = [];

  } catch (error) {
    console.error('Failed to process audio chunks:', error);
  }
}

// Convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Connect to WebSocket
async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    try {
      websocket = new WebSocket(CONFIG.WS_BASE_URL);

      websocket.onopen = () => {
        console.log('WebSocket connected');
        
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
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        websocket = null;
      };

      websocket.onerror = (error) => {
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
  console.log('WebSocket message received:', message);

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
        message: message.data.title
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
      console.error('WebSocket error:', message.error);
      // Show error notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Recording Error',
        message: message.error
      });
      break;
  }
}

// Forward message to content script
async function forwardToContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (error) {
    console.log('Failed to forward message to content script:', error);
  }
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  switch (command) {
    case 'start-recording':
      if (!isRecording) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && CONFIG.SUPPORTED_PLATFORMS.some(platform => tab.url.includes(platform))) {
          handleStartRecording({ title: 'Quick Recording' }, () => {});
        }
      }
      break;

    case 'stop-recording':
      if (isRecording) {
        handleStopRecording(() => {});
      }
      break;
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  // If popup is enabled, this won't fire
  // But we can use it as fallback
  console.log('Extension icon clicked for tab:', tab.url);
});

// Clean up on extension suspension
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up...');
  
  if (isRecording) {
    handleStopRecording(() => {});
  }
  
  if (websocket) {
    websocket.close();
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open extension popup or main app
  chrome.tabs.create({
    url: 'http://localhost:3000/dashboard'
  });
});

console.log('Meeting Intelligence: Background script initialization complete');