// // Create this as: frontend/src/pages/extension-debug.js or extension-debug.tsx
// 'use client';

// import { useState, useEffect } from 'react';
// import { useAuth } from '@/contexts/AuthContext';

// export default function ExtensionDebugPage() {
//   const { user, isAuthenticated } = useAuth();
//   const [debugInfo, setDebugInfo] = useState({});
//   const [extensionStatus, setExtensionStatus] = useState('checking');

//   useEffect(() => {
//     checkExtensionStatus();
//     const interval = setInterval(checkExtensionStatus, 2000);
//     return () => clearInterval(interval);
//   }, []);

//   const checkExtensionStatus = () => {
//     const authToken = localStorage.getItem('authToken') || localStorage.getItem('firebase-token');
//     const userInfo = localStorage.getItem('userInfo');
//     const extensionReady = localStorage.getItem('extension-auth-ready');
//     const authTimestamp = localStorage.getItem('extension-auth-timestamp');
    
//     setDebugInfo({
//       authToken: authToken ? `${authToken.substring(0, 20)}...` : 'None',
//       authTokenLength: authToken?.length || 0,
//       userInfo: userInfo ? JSON.parse(userInfo) : null,
//       extensionReady: extensionReady === 'true',
//       authTimestamp: authTimestamp ? new Date(parseInt(authTimestamp)).toLocaleString() : 'None',
//       sessionToken: sessionStorage.getItem('authToken') ? 'Present' : 'Missing',
//       currentUser: user,
//       isAuthenticated
//     });
//   };

//   const sendTokenToExtension = () => {
//     const authToken = localStorage.getItem('authToken');
//     const userInfo = localStorage.getItem('userInfo');
    
//     if (authToken && userInfo) {
//       console.log('🚀 Manually sending token to extension...');
      
//       const authData = {
//         type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
//         token: authToken,
//         user: JSON.parse(userInfo),
//         timestamp: Date.now(),
//         source: 'manual-debug-page'
//       };
      
//       // Send postMessage
//       window.postMessage(authData, '*');
      
//       // Also update timestamp
//       localStorage.setItem('extension-auth-timestamp', Date.now().toString());
//       localStorage.setItem('extension-auth-ready', 'true');
      
//       alert('Token sent to extension! Check extension popup.');
//     } else {
//       alert('No auth token found. Please sign in first.');
//     }
//   };

//   const refreshToken = async () => {
//     try {
//       console.log('🔄 Refreshing token...');
      
//       if (window.refreshExtensionAuth) {
//         await window.refreshExtensionAuth();
//         setTimeout(checkExtensionStatus, 1000);
//         alert('Token refreshed!');
//       } else {
//         alert('Token refresh function not available');
//       }
//     } catch (error) {
//       console.error('Failed to refresh token:', error);
//       alert('Failed to refresh token: ' + error.message);
//     }
//   };

//   const clearAllTokens = () => {
//     localStorage.removeItem('authToken');
//     localStorage.removeItem('firebase-token');
//     localStorage.removeItem('userInfo');
//     sessionStorage.removeItem('authToken');
//     sessionStorage.removeItem('firebase-token');
//     sessionStorage.removeItem('userInfo');
//     localStorage.removeItem('extension-auth-ready');
//     localStorage.removeItem('extension-auth-timestamp');
    
//     // Send logout message
//     window.postMessage({
//       type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
//       token: null,
//       user: null,
//       timestamp: Date.now(),
//       source: 'debug-page-clear'
//     }, '*');
    
//     setTimeout(checkExtensionStatus, 500);
//     alert('All tokens cleared!');
//   };

//   const testExtensionConnection = () => {
//     console.log('🧪 Testing extension connection...');
    
//     // Send test message
//     window.postMessage({
//       type: 'EXTENSION_CONNECTION_TEST',
//       data: 'Test from debug page',
//       timestamp: Date.now()
//     }, '*');
    
//     // Listen for response
//     const listener = (event) => {
//       if (event.data && event.data.type === 'EXTENSION_CONNECTION_RESPONSE') {
//         alert('✅ Extension responded! Connection is working.');
//         window.removeEventListener('message', listener);
//       }
//     };
    
//     window.addEventListener('message', listener);
    
//     // Timeout after 5 seconds
//     setTimeout(() => {
//       window.removeEventListener('message', listener);
//       alert('❌ No response from extension. It may not be installed or running.');
//     }, 5000);
//   };

//   return (
//     <div className="min-h-screen bg-gray-50 py-8">
//       <div className="max-w-4xl mx-auto px-4">
//         <div className="bg-white rounded-lg shadow p-6">
//           <h1 className="text-3xl font-bold text-gray-900 mb-6">
//             🔧 Extension Debug Center
//           </h1>
          
//           <p className="text-gray-600 mb-8">
//             This page helps you debug the connection between the Meeting Intelligence website and Chrome extension.
//           </p>

//           {/* Authentication Status */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">🔐 Authentication Status</h2>
//             <div className="bg-gray-50 rounded p-4">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div>
//                   <strong>Authenticated:</strong> 
//                   <span className={`ml-2 px-2 py-1 rounded text-sm ${isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
//                     {isAuthenticated ? 'Yes' : 'No'}
//                   </span>
//                 </div>
//                 <div>
//                   <strong>Current User:</strong> {user?.email || 'None'}
//                 </div>
//                 <div>
//                   <strong>Auth Token:</strong> {debugInfo.authToken || 'None'}
//                 </div>
//                 <div>
//                   <strong>Token Length:</strong> {debugInfo.authTokenLength} chars
//                 </div>
//                 <div>
//                   <strong>Extension Ready:</strong>
//                   <span className={`ml-2 px-2 py-1 rounded text-sm ${debugInfo.extensionReady ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
//                     {debugInfo.extensionReady ? 'Yes' : 'No'}
//                   </span>
//                 </div>
//                 <div>
//                   <strong>Last Update:</strong> {debugInfo.authTimestamp}
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* Actions */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">🎛️ Actions</h2>
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//               <button
//                 onClick={sendTokenToExtension}
//                 className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
//                 disabled={!isAuthenticated}
//               >
//                 📤 Send Token to Extension
//               </button>
              
//               <button
//                 onClick={refreshToken}
//                 className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
//                 disabled={!isAuthenticated}
//               >
//                 🔄 Refresh Token
//               </button>
              
//               <button
//                 onClick={testExtensionConnection}
//                 className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
//               >
//                 🧪 Test Extension Connection
//               </button>
              
//               <button
//                 onClick={clearAllTokens}
//                 className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
//               >
//                 🧹 Clear All Tokens
//               </button>
//             </div>
//           </div>

//           {/* Storage Debug */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">💾 Storage Debug</h2>
//             <div className="bg-gray-50 rounded p-4">
//               <h3 className="font-medium mb-2">LocalStorage:</h3>
//               <pre className="text-sm bg-white p-2 rounded border overflow-auto">
//                 {JSON.stringify({
//                   authToken: localStorage.getItem('authToken') ? `${localStorage.getItem('authToken').substring(0, 30)}...` : null,
//                   'firebase-token': localStorage.getItem('firebase-token') ? `${localStorage.getItem('firebase-token').substring(0, 30)}...` : null,
//                   userInfo: localStorage.getItem('userInfo'),
//                   'extension-auth-ready': localStorage.getItem('extension-auth-ready'),
//                   'extension-auth-timestamp': localStorage.getItem('extension-auth-timestamp')
//                 }, null, 2)}
//               </pre>
              
//               <h3 className="font-medium mb-2 mt-4">SessionStorage:</h3>
//               <pre className="text-sm bg-white p-2 rounded border overflow-auto">
//                 {JSON.stringify({
//                   authToken: sessionStorage.getItem('authToken') ? `${sessionStorage.getItem('authToken').substring(0, 30)}...` : null,
//                   'firebase-token': sessionStorage.getItem('firebase-token') ? `${sessionStorage.getItem('firebase-token').substring(0, 30)}...` : null,
//                   userInfo: sessionStorage.getItem('userInfo')
//                 }, null, 2)}
//               </pre>
//             </div>
//           </div>

//           {/* Instructions */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">📋 Troubleshooting Steps</h2>
//             <div className="bg-blue-50 rounded p-4">
//               <ol className="list-decimal list-inside space-y-2 text-sm">
//                 <li>Make sure you're signed in (see Authentication Status above)</li>
//                 <li>Click "Send Token to Extension" to manually send your auth token</li>
//                 <li>Open the Chrome extension popup</li>
//                 <li>Click "Check Status" or "Force Refresh" in the extension</li>
//                 <li>If still not working, click "Refresh Token" here and try again</li>
//                 <li>Check the browser console (F12) for error messages</li>
//               </ol>
//             </div>
//           </div>

//           {/* Console Logs */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">🖥️ Console Helper</h2>
//             <div className="bg-gray-50 rounded p-4">
//               <p className="text-sm text-gray-600 mb-2">
//                 Open the browser console (F12) and run these commands to manually check/send tokens:
//               </p>
//               <pre className="text-sm bg-white p-2 rounded border">
// {`// Check if token exists
// console.log('Auth Token:', localStorage.getItem('authToken'));

// // Send token to extension manually
// window.postMessage({
//   type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
//   token: localStorage.getItem('authToken'),
//   user: JSON.parse(localStorage.getItem('userInfo') || 'null'),
//   timestamp: Date.now(),
//   source: 'manual-console'
// }, '*');

// // Force refresh token (if function exists)
// if (window.refreshExtensionAuth) {
//   window.refreshExtensionAuth();
// }`}
//               </pre>
//             </div>
//           </div>

//           {/* Extension Installation Check */}
//           <div className="mb-8">
//             <h2 className="text-xl font-semibold mb-4">🧩 Extension Status</h2>
//             <div className="bg-yellow-50 rounded p-4">
//               <p className="text-sm text-yellow-800 mb-2">
//                 <strong>Extension Installation Steps:</strong>
//               </p>
//               <ol className="list-decimal list-inside space-y-1 text-sm text-yellow-700">
//                 <li>Go to <code>chrome://extensions/</code></li>
//                 <li>Enable "Developer mode" (top right toggle)</li>
//                 <li>Click "Load unpacked"</li>
//                 <li>Select your <code>frontend/chrome-extension/public/</code> folder</li>
//                 <li>Make sure the extension appears in the list and is enabled</li>
//                 <li>Click the extension icon in Chrome toolbar</li>
//               </ol>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }