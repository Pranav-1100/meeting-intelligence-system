const admin = require('firebase-admin');
const { getDb } = require('../database/init');
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

/**
 * Middleware to authenticate Firebase tokens and manage users
 */
const authenticateFirebase = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    if (!decodedToken) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid token' 
      });
    }

    // Get or create user in our database
    const user = await getOrCreateUser(decodedToken);
    
    // Attach user info to request
    req.user = user;
    req.firebaseUser = decodedToken;
    
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        error: 'Token Expired', 
        message: 'Your session has expired. Please log in again.' 
      });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ 
        error: 'Token Revoked', 
        message: 'Your session has been revoked. Please log in again.' 
      });
    }
    
    return res.status(401).json({ 
      error: 'Authentication Failed', 
      message: 'Failed to authenticate user' 
    });
  }
};

/**
 * Get existing user or create new user in database
 */
const getOrCreateUser = async (firebaseUser) => {
  const db = getDb();
  
  try {
    // First, try to find existing user
    const existingUser = db.prepare(
      'SELECT * FROM users WHERE firebase_uid = ?'
    ).get(firebaseUser.uid);

    if (existingUser) {
      // Update last login
      db.prepare(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(existingUser.id);
      
      return existingUser;
    }

    // Create new user
    const userId = uuidv4();
    const userData = {
      id: userId,
      firebase_uid: firebaseUser.uid,
      email: firebaseUser.email,
      display_name: firebaseUser.name || firebaseUser.email.split('@')[0],
      photo_url: firebaseUser.picture || null,
      provider: getAuthProvider(firebaseUser),
      last_login: new Date().toISOString(),
      settings: JSON.stringify({
        notifications: true,
        theme: 'light',
        language: 'en',
        autoTranscription: true,
        realtimeProcessing: true
      })
    };

    const insertUser = db.prepare(`
      INSERT INTO users (
        id, firebase_uid, email, display_name, photo_url, 
        provider, last_login, settings
      ) VALUES (
        @id, @firebase_uid, @email, @display_name, @photo_url,
        @provider, @last_login, @settings
      )
    `);

    insertUser.run(userData);
    
    console.log(`✅ New user created: ${userData.email}`);
    
    return userData;

  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
};

/**
 * Determine auth provider from Firebase user
 */
const getAuthProvider = (firebaseUser) => {
  if (firebaseUser.firebase?.identities) {
    const identities = firebaseUser.firebase.identities;
    if (identities['google.com']) return 'google';
    if (identities['email']) return 'email';
  }
  return 'email'; // default
};

/**
 * Optional middleware to check if user has specific permissions
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // For now, all authenticated users have all permissions
    // This can be extended with role-based access control
    const userPermissions = getUserPermissions(req.user);
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `Permission '${permission}' required` 
      });
    }

    next();
  };
};

/**
 * Get user permissions based on subscription tier and role
 */
const getUserPermissions = (user) => {
  const basePermissions = [
    'upload_audio',
    'view_transcripts',
    'create_meetings',
    'view_meetings'
  ];

  const premiumPermissions = [
    ...basePermissions,
    'realtime_transcription',
    'speaker_diarization',
    'advanced_analysis',
    'mcp_integrations',
    'bulk_export'
  ];

  // Check subscription tier
  switch (user.subscription_tier) {
    case 'premium':
    case 'enterprise':
      return premiumPermissions;
    default:
      return basePermissions;
  }
};

/**
 * Middleware to validate organization access
 */
const validateOrganizationAccess = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user.id;

    if (!organizationId) {
      return next(); // No organization specified, continue
    }

    const db = getDb();
    const membership = db.prepare(`
      SELECT uo.*, o.name as org_name 
      FROM user_organizations uo
      JOIN organizations o ON uo.organization_id = o.id
      WHERE uo.user_id = ? AND uo.organization_id = ? AND uo.is_active = 1
    `).get(userId, organizationId);

    if (!membership) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Access denied to this organization' 
      });
    }

    req.organization = membership;
    next();

  } catch (error) {
    console.error('Organization validation error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to validate organization access' 
    });
  }
};

module.exports = {
  authenticateFirebase,
  requirePermission,
  validateOrganizationAccess,
  getUserPermissions
};