// backend/routes/auth.js - VERSION JWT
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const router = express.Router();
const { getPool } = require('../database/db');

// 🔥 IMPORT DES HELPERS EMAILS
const { 
  sendWelcomeEmail,
  sendPasswordResetEmail 
} = require('../utils/emailHelpers');

// ============================================
// CONFIGURATION JWT
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 jours

// ============================================
// UTILITAIRES JWT
// ============================================
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// ============================================
// MIDDLEWARE D'AUTHENTIFICATION JWT
// ============================================
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Non authentifié',
      message: 'Token manquant ou invalide'
    });
  }
  
  const token = authHeader.substring(7); // Enlever "Bearer "
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ 
      error: 'Token invalide ou expiré' 
    });
  }
  
  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  req.userRole = decoded.role;
  
  next();
};

// ============================================
// UTILITAIRES VALIDATION
// ============================================
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isStrongPassword = (password) => {
  return password.length >= 6;
};

const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection.remoteAddress || 
         req.ip;
};

const isAccountLocked = async (pool, email) => {
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  const lockoutDuration = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 15;
  
  const result = await pool.query(
    `SELECT COUNT(*) as attempts 
     FROM login_attempts 
     WHERE email = $1 
     AND success = false 
     AND attempted_at > NOW() - INTERVAL '${lockoutDuration} minutes'`,
    [email]
  );
  
  return parseInt(result.rows[0].attempts) >= maxAttempts;
};

const logLoginAttempt = async (pool, email, ip, success, userAgent) => {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, success, user_agent) 
     VALUES ($1, $2, $3, $4)`,
    [email, ip, success, userAgent]
  );
};

// ============================================
// ROUTES
// ============================================

/**
 * POST /auth/register
 * Inscription avec JWT et email bienvenue
 */
router.post('/register', async (req, res) => {
  const pool = getPool();
  const { email, password, firstname, lastname, company_name, phone } = req.body;

  try {
    // Validation des champs requis
    if (!email || !password || !firstname || !lastname) {
      return res.status(400).json({ 
        error: 'Email, mot de passe, prénom et nom sont requis' 
      });
    }

    // Validation format email
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Format d\'email invalide' 
      });
    }

    // Validation longueur mot de passe
    if (!isStrongPassword(password)) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir au moins 6 caractères' 
      });
    }

    // Vérifier si l'email existe déjà
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cet email est déjà utilisé' 
      });
    }

    // Hash du mot de passe
    const passwordHash = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const result = await pool.query(`
      INSERT INTO users (
        email, 
        password_hash, 
        firstname, 
        lastname, 
        company_name, 
        phone, 
        role,
        is_active,
        email_verified
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'client', true, false)
      RETURNING id, email, firstname, lastname, company_name, phone, role, created_at
    `, [
      email.toLowerCase(), 
      passwordHash, 
      firstname, 
      lastname, 
      company_name || null, 
      phone || null
    ]);

    const user = result.rows[0];

    // 🔥 ENVOYER EMAIL DE BIENVENUE
    sendWelcomeEmail(user).catch(err => {
      console.error('❌ Erreur envoi email bienvenue:', err);
      // On ne bloque pas l'inscription si l'email échoue
    });

    // Créer préférences email par défaut
    await pool.query(`
      INSERT INTO email_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
    `, [user.id]);

    // Générer token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Inscription réussie:', user.email);

    res.status(201).json({
      message: 'Inscription réussie',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({ 
      error: 'Erreur lors de l\'inscription' 
    });
  }
});

/**
 * POST /auth/login
 * Connexion avec JWT
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const pool = getPool();
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'];
  
  try {
    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email et mot de passe requis' 
      });
    }
    
    // Vérifier blocage
    const locked = await isAccountLocked(pool, email.toLowerCase());
    if (locked) {
      const lockoutMinutes = process.env.LOCKOUT_DURATION_MINUTES || 15;
      return res.status(429).json({ 
        error: `Compte temporairement bloqué. Réessayez dans ${lockoutMinutes} minutes.` 
      });
    }
    
    // Récupérer l'utilisateur
    const result = await pool.query(
      `SELECT id, email, password_hash, firstname, lastname, role, is_active 
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      await logLoginAttempt(pool, email.toLowerCase(), clientIp, false, userAgent);
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    const user = result.rows[0];
    
    // Vérifier compte actif
    if (!user.is_active) {
      return res.status(403).json({ 
        error: 'Compte désactivé. Contactez l\'administrateur.' 
      });
    }
    
    // Vérifier mot de passe
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      await logLoginAttempt(pool, email.toLowerCase(), clientIp, false, userAgent);
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Connexion réussie
    await logLoginAttempt(pool, email.toLowerCase(), clientIp, true, userAgent);
    
    // Mettre à jour dernière connexion
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Générer le token JWT
    const token = generateToken(user);
    
    console.log(`✅ Connexion réussie: ${user.email} (IP: ${clientIp})`);
    
    // Réponse avec token
    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur connexion:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la connexion' 
    });
  }
});

/**
 * POST /auth/logout
 * Déconnexion (côté client uniquement avec JWT)
 */
router.post('/logout', requireAuth, (req, res) => {
  console.log(`✅ Déconnexion: ${req.userEmail}`);
  res.json({ 
    message: 'Déconnexion réussie',
    // Avec JWT, le client doit supprimer le token
  });
});

/**
 * GET /auth/me
 * Récupérer l'utilisateur connecté
 */
router.get('/me', requireAuth, async (req, res) => {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      `SELECT id, firstname, lastname, email, role, phone, avatar_url, 
              email_verified, created_at, last_login 
       FROM users 
       WHERE id = $1`,
      [req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    res.json({ user: result.rows[0] });
    
  } catch (error) {
    console.error('❌ Erreur récupération utilisateur:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la récupération des données' 
    });
  }
});

/**
 * GET /auth/check
 * Vérifier le token
 */
router.get('/check', requireAuth, (req, res) => {
  res.json({ 
    authenticated: true,
    userId: req.userId,
    email: req.userEmail,
    role: req.userRole
  });
});

/**
 * POST /auth/refresh
 * Rafraîchir le token
 */
router.post('/refresh', requireAuth, async (req, res) => {
  const pool = getPool();
  
  try {
    const result = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1 AND is_active = true',
      [req.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const newToken = generateToken(result.rows[0]);
    
    res.json({
      message: 'Token rafraîchi',
      token: newToken
    });
    
  } catch (error) {
    console.error('❌ Erreur refresh token:', error);
    res.status(500).json({ 
      error: 'Erreur lors du rafraîchissement du token' 
    });
  }
});

// ============================================
// POST /auth/forgot-password - DEMANDE RESET PASSWORD
// ============================================
router.post('/forgot-password', async (req, res) => {
  const pool = getPool();
  const { email } = req.body;

  try {
    // Validation
    if (!email) {
      return res.status(400).json({ 
        error: 'Email requis' 
      });
    }

    // Chercher l'utilisateur
    const result = await pool.query(
      'SELECT id, email, firstname, lastname FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // ⚠️ IMPORTANT : Toujours renvoyer la même réponse (sécurité)
    // Ne pas révéler si l'email existe ou non
    if (result.rows.length === 0) {
      console.log('🔍 Email non trouvé (mais on ne le dit pas):', email);
      return res.json({ 
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé' 
      });
    }

    const user = result.rows[0];

    // Générer token de reset (32 bytes = 64 caractères en hex)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 heure

    // Supprimer les anciens tokens de cet utilisateur
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1',
      [user.id]
    );

    // Sauvegarder le nouveau token
    await pool.query(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
      VALUES ($1, $2, $3, false)
    `, [user.id, resetToken, expiresAt]);

    // 🔥 ENVOYER EMAIL DE RESET
    sendPasswordResetEmail(user, resetToken).catch(err => {
      console.error('❌ Erreur envoi email reset:', err);
    });

    console.log('✅ Email reset envoyé:', user.email);

    res.json({ 
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé' 
    });

  } catch (error) {
    console.error('❌ Erreur forgot-password:', error);
    res.status(500).json({ 
      error: 'Erreur serveur' 
    });
  }
});

// ============================================
// POST /auth/reset-password - RESET PASSWORD (avec token)
// ============================================
router.post('/reset-password', async (req, res) => {
  const pool = getPool();
  const { token, newPassword } = req.body;

  try {
    // Validation
    if (!token || !newPassword) {
      return res.status(400).json({ 
        error: 'Token et nouveau mot de passe requis' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Le mot de passe doit contenir au moins 6 caractères' 
      });
    }

    // Vérifier le token
    const tokenResult = await pool.query(`
      SELECT 
        prt.id as token_id,
        prt.user_id,
        prt.expires_at,
        prt.used,
        u.email,
        u.firstname,
        u.lastname
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = $1
    `, [token]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Token invalide ou expiré' 
      });
    }

    const tokenData = tokenResult.rows[0];

    // Vérifier si déjà utilisé
    if (tokenData.used) {
      return res.status(400).json({ 
        error: 'Ce lien a déjà été utilisé' 
      });
    }

    // Vérifier si expiré
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(400).json({ 
        error: 'Ce lien a expiré. Demandez un nouveau lien.' 
      });
    }

    // Hash du nouveau mot de passe
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Mettre à jour le mot de passe
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, tokenData.user_id]
    );

    // Marquer le token comme utilisé
    await pool.query(
      'UPDATE password_reset_tokens SET used = true WHERE id = $1',
      [tokenData.token_id]
    );

    console.log('✅ Mot de passe réinitialisé:', tokenData.email);

    res.json({ 
      message: 'Mot de passe réinitialisé avec succès' 
    });

  } catch (error) {
    console.error('❌ Erreur reset-password:', error);
    res.status(500).json({ 
      error: 'Erreur serveur' 
    });
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
