'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChange, logout } from '@/lib/firebase';
import api from '@/lib/api';

const AuthContext = createContext({});

/**
 * Auth Provider Component with Enhanced Extension Communication
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      setLoading(true);
      setError(null);

      try {
        if (firebaseUser) {
          console.log('🔐 Firebase user authenticated:', firebaseUser.email);
          
          // 🔑 GET AND STORE TOKEN FOR EXTENSION - ENHANCED
          try {
            const token = await firebaseUser.getIdToken();
            console.log('🔑 Firebase token obtained:', token.substring(0, 20) + '...');
            
            // Store token in multiple locations for extension access
            localStorage.setItem('firebase-token', token);
            localStorage.setItem('authToken', token);
            sessionStorage.setItem('firebase-token', token);
            sessionStorage.setItem('authToken', token);
            
            // Store user info for extension
            const userInfo = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
              photoURL: firebaseUser.photoURL,
              emailVerified: firebaseUser.emailVerified,
              createdAt: firebaseUser.metadata?.creationTime,
              lastLoginAt: firebaseUser.metadata?.lastSignInTime
            };
            
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            console.log('💾 Token and user info stored for extension access');
            
            // ENHANCED: Send multiple postMessage formats for extension compatibility
            const authData = {
              token: token,
              user: userInfo,
              timestamp: Date.now(),
              source: 'website-auth-context'
            };
            
            // Format 1: Our specific format
            window.postMessage({
              type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
              ...authData
            }, '*');
            
            // Format 2: Generic auth format
            window.postMessage({
              type: 'AUTH_TOKEN_UPDATE',
              ...authData
            }, '*');
            
            // Format 3: Firebase specific format
            window.postMessage({
              type: 'FIREBASE_AUTH_UPDATE',
              ...authData
            }, '*');
            
            console.log('📡 Enhanced postMessage sent to extension');
            
            // ENHANCED: Also try to communicate with extension directly
            try {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                // Try to send directly to extension (won't work from website, but worth trying)
                chrome.runtime.sendMessage({
                  type: 'AUTH_TOKEN_FROM_WEBSITE',
                  ...authData
                });
                console.log('📤 Direct message sent to extension');
              }
            } catch (chromeError) {
              console.log('💡 Direct chrome message not available (expected from website)');
            }
            
            // ENHANCED: Dispatch custom event for any listeners
            window.dispatchEvent(new CustomEvent('meetingIntelligenceAuth', {
              detail: authData
            }));
            
            // ENHANCED: Store extension-ready flag
            localStorage.setItem('extension-auth-ready', 'true');
            localStorage.setItem('extension-auth-timestamp', Date.now().toString());
            
          } catch (tokenError) {
            console.error('❌ Failed to get Firebase token:', tokenError);
          }
          
          // Verify with backend and get user data
          try {
            const response = await api.verifyAuth();
            console.log('✅ Backend verification successful:', response.user);
            setUser(response.user);
          } catch (apiError) {
            console.error('⚠️ Backend verification failed:', apiError);
            
            // Create fallback user object
            const fallbackUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              display_name: firebaseUser.displayName || firebaseUser.email?.split('@')[0],
              photo_url: firebaseUser.photoURL,
              provider: firebaseUser.providerData[0]?.providerId || 'email',
              created_at: firebaseUser.metadata?.creationTime,
              last_login: firebaseUser.metadata?.lastSignInTime,
              subscription_tier: 'free',
              email_verified: firebaseUser.emailVerified
            };
            
            console.log('🔄 Using fallback user data:', fallbackUser);
            setUser(fallbackUser);
            setError('Backend connection failed, using limited functionality');
          }
        } else {
          console.log('🚪 User signed out');
          
          // 🔑 ENHANCED CLEANUP ON LOGOUT
          localStorage.removeItem('firebase-token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userInfo');
          sessionStorage.removeItem('firebase-token');
          sessionStorage.removeItem('authToken');
          sessionStorage.removeItem('userInfo');
          localStorage.removeItem('extension-auth-ready');
          localStorage.removeItem('extension-auth-timestamp');
          
          // Enhanced logout postMessage
          const logoutData = {
            token: null,
            user: null,
            timestamp: Date.now(),
            source: 'website-logout'
          };
          
          window.postMessage({
            type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
            ...logoutData
          }, '*');
          
          window.postMessage({
            type: 'AUTH_TOKEN_UPDATE',
            ...logoutData
          }, '*');
          
          window.dispatchEvent(new CustomEvent('meetingIntelligenceAuth', {
            detail: logoutData
          }));
          
          console.log('🧹 Enhanced cleanup completed for extension');
          setUser(null);
        }
      } catch (error) {
        console.error('❌ Auth state change error:', error);
        setError(error.message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // ENHANCED: Setup extension communication helpers
  useEffect(() => {
    // Helper function to refresh and send token
    const refreshTokenForExtension = async () => {
      try {
        if (auth.currentUser) {
          console.log('🔄 Refreshing token for extension...');
          const token = await auth.currentUser.getIdToken(true); // Force refresh
          
          // Update storage
          localStorage.setItem('authToken', token);
          localStorage.setItem('firebase-token', token);
          sessionStorage.setItem('authToken', token);
          sessionStorage.setItem('firebase-token', token);
          localStorage.setItem('extension-auth-timestamp', Date.now().toString());
          
          // Send updated token
          const authData = {
            token: token,
            user: {
              uid: auth.currentUser.uid,
              email: auth.currentUser.email,
              displayName: auth.currentUser.displayName
            },
            timestamp: Date.now(),
            source: 'website-refresh'
          };
          
          window.postMessage({
            type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
            ...authData
          }, '*');
          
          console.log('✅ Token refreshed and sent to extension');
        }
      } catch (error) {
        console.error('❌ Failed to refresh token for extension:', error);
      }
    };

    // Add global function for extension to call
    window.refreshExtensionAuth = refreshTokenForExtension;
    
    // Listen for extension requests
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'REQUEST_AUTH_TOKEN') {
        console.log('📨 Extension requested auth token');
        refreshTokenForExtension();
      }
    });

    // Cleanup
    return () => {
      delete window.refreshExtensionAuth;
    };
  }, []);

  const signOut = async () => {
    try {
      setLoading(true);
      
      // Enhanced cleanup before logout
      localStorage.removeItem('firebase-token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('userInfo');
      sessionStorage.removeItem('firebase-token');
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('userInfo');
      localStorage.removeItem('extension-auth-ready');
      localStorage.removeItem('extension-auth-timestamp');
      
      await logout();
      setUser(null);
      setError(null);
      
      // Enhanced logout notification
      window.postMessage({
        type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
        token: null,
        user: null,
        timestamp: Date.now(),
        source: 'website-signout'
      }, '*');
      
      console.log('✅ Enhanced sign out completed');
      
    } catch (error) {
      console.error('❌ Sign out failed:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await api.getUserProfile();
      setUser(response.user);
      
      // Also refresh token for extension
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken(true); // Force refresh
        localStorage.setItem('firebase-token', token);
        localStorage.setItem('authToken', token);
        sessionStorage.setItem('firebase-token', token);
        sessionStorage.setItem('authToken', token);
        localStorage.setItem('extension-auth-timestamp', Date.now().toString());
        
        // Notify extension of refresh
        window.postMessage({
          type: 'MEETING_INTELLIGENCE_AUTH_UPDATE',
          token: token,
          user: {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName
          },
          timestamp: Date.now(),
          source: 'website-user-refresh'
        }, '*');
        
        console.log('🔄 User and token refreshed');
      }
    } catch (error) {
      console.error('❌ Failed to refresh user:', error);
      setError(error.message);
    }
  };

  const value = {
    user,
    loading,
    error,
    signOut,
    refreshUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Enhanced Auth Hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

/**
 * Require Auth HOC
 */
export function withAuth(WrappedComponent) {
  return function AuthenticatedComponent(props) {
    const { user, loading } = useAuth();

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
            <p className="text-gray-600">Please sign in to access this page.</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };
}

export default useAuth;