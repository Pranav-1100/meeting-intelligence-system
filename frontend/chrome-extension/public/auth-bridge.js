// Auth Bridge Script - Automatically shares tokens with extension
console.log('🔑 Meeting Intelligence Auth Bridge loaded');

let lastTokenSent = null;
let authCheckInterval = null;

// Initialize immediately
initializeAuthBridge();

function initializeAuthBridge() {
  console.log('Initializing auth bridge...');
  
  // Send current token immediately
  setTimeout(sendCurrentToken, 1000);
  
  // Check every 10 seconds
  authCheckInterval = setInterval(sendCurrentToken, 10000);
  
  // Listen for storage changes
  window.addEventListener('storage', (event) => {
    if (event.key === 'firebase-token' || event.key === 'authToken') {
      console.log('Storage changed, sending new token');
      setTimeout(sendCurrentToken, 500);
    }
  });
  
  // Listen for auth updates from frontend
  window.addEventListener('message', (event) => {
    if (event.data.type === 'MEETING_INTELLIGENCE_AUTH_UPDATE') {
      console.log('Auth update message received');
      setTimeout(sendCurrentToken, 500);
    }
  });
}

function sendCurrentToken() {
  try {
    const token = getCurrentAuthToken();
    
    if (token && token !== lastTokenSent) {
      console.log('🔑 Sending new token to extension');
      sendTokenToExtension(token);
      lastTokenSent = token;
      showAuthStatus('Token shared with extension', 'success');
    } else if (!token && lastTokenSent) {
      console.log('🚪 Clearing extension auth');
      sendTokenToExtension(null);
      lastTokenSent = null;
      showAuthStatus('Logged out', 'info');
    }
  } catch (error) {
    console.error('Error sending token:', error);
  }
}

function getCurrentAuthToken() {
  // Try multiple storage keys
  const tokenKeys = ['firebase-token', 'authToken', 'auth-token'];
  
  // Check localStorage
  for (const key of tokenKeys) {
    const token = localStorage.getItem(key);
    if (token && token.length > 50) {
      console.log(`Found token in localStorage: ${key}`);
      return token;
    }
  }
  
  // Check sessionStorage
  for (const key of tokenKeys) {
    const token = sessionStorage.getItem(key);
    if (token && token.length > 50) {
      console.log(`Found token in sessionStorage: ${key}`);
      return token;
    }
  }
  
  return null;
}

function sendTokenToExtension(token) {
  try {
    // Method 1: Direct extension messaging
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SET_AUTH_TOKEN',
        token: token,
        source: 'auth-bridge',
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Extension not available:', chrome.runtime.lastError.message);
        } else {
          console.log('✅ Token sent to extension via chrome.runtime');
        }
      });
    }
    
    // Method 2: PostMessage (backup)
    window.postMessage({
      type: 'MEETING_INTELLIGENCE_SET_TOKEN',
      token: token,
      source: 'auth-bridge'
    }, '*');
    
    console.log('Token sent via postMessage');
    
  } catch (error) {
    console.error('Failed to send token:', error);
  }
}

function showAuthStatus(message, type = 'info') {
  // Remove existing status
  const existing = document.getElementById('meeting-intelligence-auth-status');
  if (existing) existing.remove();
  
  // Create status indicator
  const status = document.createElement('div');
  status.id = 'meeting-intelligence-auth-status';
  status.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;
  
  status.innerHTML = `
    <div style="display: flex; align-items: center; gap: 6px;">
      <div style="width: 6px; height: 6px; background: white; border-radius: 50%; opacity: 0.8;"></div>
      <span>Meeting Intelligence: ${message}</span>
    </div>
  `;
  
  document.body.appendChild(status);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (status.parentNode) {
      status.style.opacity = '0';
      setTimeout(() => {
        if (status.parentNode) status.remove();
      }, 300);
    }
  }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (authCheckInterval) {
    clearInterval(authCheckInterval);
  }
});

console.log('✅ Auth Bridge initialized');