// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();

// ============================================
// UTILITAIRES
// ============================================

// Validation email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validation mot de passe fort
const isStrongPassword = (password) => {
  return password.length >= 6;
};

// Obtenir l'IP du client
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.connection.remoteAddress || 
         req.ip;
};

// Vérifier si un compte est bloqué
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

// Enregistrer une tentative de connexion
const logLoginAttempt = async (pool, email, ip, success, userAgent) => {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, success, user_agent) 
     VALUES ($1, $2, $3, $4)`,
    [email, ip, success, userAgent]
  );
};

// ============================================
// MIDDLEWARE D'AUTHENTIFICATION
// ============================================
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
};

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 */
router.post('/register', async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  const pool = req.app.locals.pool;
  
  try {
    // Validation des champs
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ 
        error: 'Tous les champs sont requis' 
      });
    }
    
    // Validation prénom/nom
    if (firstname.trim().length < 2 || lastname.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Le prénom et le nom doivent contenir au moins 2 caractères' 
      });
    }
    
    // Validation email
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Email invalide' 
      });
    }
    
    // Validation mot de passe
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
      return res.status(409).json({ 
        error: 'Cet email est déjà utilisé' 
      });
    }
    
    // Hacher le mot de passe
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Créer l'utilisateur
    const result = await pool.query(
      `INSERT INTO users (firstname, lastname, email, password_hash, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, firstname, lastname, email, role, created_at`,
      [
        firstname.trim(),
        lastname.trim(),
        email.toLowerCase(),
        passwordHash,
        'user'
      ]
    );
    
    const newUser = result.rows[0];
    
    // Créer la session
    req.session.userId = newUser.id;
    req.session.userEmail = newUser.email;
    req.session.userRole = newUser.role;
    
    // Log de la création
    console.log(`✅ Nouvel utilisateur créé: ${newUser.email} (ID: ${newUser.id})`);
    
    // Réponse
    res.status(201).json({
      message: 'Compte créé avec succès',
      user: {
        id: newUser.id,
        firstname: newUser.firstname,
        lastname: newUser.lastname,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la création du compte' 
    });
  }
});

/**
 * POST /api/auth/login
 * Connexion d'un utilisateur
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const pool = req.app.locals.pool;
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'];
  
  try {
    // Validation des champs
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email et mot de passe requis' 
      });
    }
    
    // Vérifier si le compte est bloqué
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
    
    // Vérifier si le compte est actif
    if (!user.is_active) {
      return res.status(403).json({ 
        error: 'Compte désactivé. Contactez l\'administrateur.' 
      });
    }
    
    // Vérifier le mot de passe
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      await logLoginAttempt(pool, email.toLowerCase(), clientIp, false, userAgent);
      return res.status(401).json({ 
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    // Connexion réussie
    await logLoginAttempt(pool, email.toLowerCase(), clientIp, true, userAgent);
    
    // Mettre à jour la date de dernière connexion
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Créer la session
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userRole = user.role;
    
    console.log(`✅ Connexion réussie: ${user.email} (IP: ${clientIp})`);
    
    // Réponse
    res.json({
      message: 'Connexion réussie',
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
 * POST /api/auth/logout
 * Déconnexion de l'utilisateur
 */
router.post('/logout', requireAuth, (req, res) => {
  const userEmail = req.session.userEmail;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Erreur déconnexion:', err);
      return res.status(500).json({ 
        error: 'Erreur lors de la déconnexion' 
      });
    }
    
    res.clearCookie('sessionId');
    console.log(`✅ Déconnexion: ${userEmail}`);
    
    res.json({ message: 'Déconnexion réussie' });
  });
});

/**
 * GET /api/auth/me
 * Récupérer les informations de l'utilisateur connecté
 */
router.get('/me', requireAuth, async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      `SELECT id, firstname, lastname, email, role, phone, avatar_url, 
              email_verified, created_at, last_login 
       FROM users 
       WHERE id = $1`,
      [req.session.userId]
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
 * GET /api/auth/check
 * Vérifier si l'utilisateur est authentifié
 */
router.get('/check', (req, res) => {
  res.json({ 
    authenticated: !!req.session.userId,
    userId: req.session.userId || null
  });
});

module.exports = router;
module.exports.requireAuth = requireAuth;