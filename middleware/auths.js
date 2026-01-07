// backend/middleware/auth.js

/**
 * Middleware pour vérifier l'authentification
 */
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      error: 'Non authentifié',
      message: 'Vous devez être connecté pour accéder à cette ressource'
    });
  }
  next();
};

/**
 * Middleware pour vérifier le rôle admin
 */
const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      error: 'Non authentifié' 
    });
  }

  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    if (result.rows[0].role !== 'admin') {
      return res.status(403).json({ 
        error: 'Accès non autorisé',
        message: 'Vous devez être administrateur pour accéder à cette ressource'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur vérification admin:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification des permissions' 
    });
  }
};

/**
 * Middleware pour vérifier le rôle staff (employé)
 */
const requireStaff = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      error: 'Non authentifié' 
    });
  }

  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    const userRole = result.rows[0].role;
    
    if (userRole !== 'admin' && userRole !== 'staff') {
      return res.status(403).json({ 
        error: 'Accès non autorisé',
        message: 'Vous devez être membre du personnel pour accéder à cette ressource'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur vérification staff:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification des permissions' 
    });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur est actif
 */
const requireActiveAccount = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ 
      error: 'Non authentifié' 
    });
  }

  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      'SELECT is_active FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Utilisateur non trouvé' 
      });
    }
    
    if (!result.rows[0].is_active) {
      // Détruire la session
      req.session.destroy();
      
      return res.status(403).json({ 
        error: 'Compte désactivé',
        message: 'Votre compte a été désactivé. Contactez l\'administrateur.'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur vérification compte actif:', error);
    res.status(500).json({ 
      error: 'Erreur lors de la vérification du compte' 
    });
  }
};

/**
 * Middleware optionnel - Récupère l'utilisateur si authentifié
 * Permet d'accéder à la route même sans authentification
 */
const optionalAuth = async (req, res, next) => {
  if (req.session.userId) {
    const pool = req.app.locals.pool;
    
    try {
      const result = await pool.query(
        'SELECT id, email, firstname, lastname, role FROM users WHERE id = $1',
        [req.session.userId]
      );
      
      if (result.rows.length > 0) {
        req.user = result.rows[0];
      }
    } catch (error) {
      console.error('❌ Erreur récupération utilisateur optionnel:', error);
    }
  }
  
  next();
};

/**
 * Middleware pour attacher les infos utilisateur à la requête
 */
const attachUser = async (req, res, next) => {
  if (!req.session.userId) {
    return next();
  }

  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      `SELECT id, email, firstname, lastname, role, is_active, 
              email_verified, avatar_url, created_at 
       FROM users 
       WHERE id = $1`,
      [req.session.userId]
    );
    
    if (result.rows.length > 0) {
      req.user = result.rows[0];
    }
    
    next();
  } catch (error) {
    console.error('❌ Erreur attachement utilisateur:', error);
    next();
  }
};

/**
 * Middleware pour vérifier la propriété d'une ressource
 * Utilisation: requireOwnership('user_id', 'query')
 */
const requireOwnership = (userIdField, location = 'params') => {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ 
        error: 'Non authentifié' 
      });
    }

    const resourceUserId = req[location][userIdField];
    
    // Les admins peuvent accéder à toutes les ressources
    const pool = req.app.locals.pool;
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (userResult.rows[0]?.role === 'admin') {
      return next();
    }
    
    // Vérifier la propriété
    if (resourceUserId !== req.session.userId) {
      return res.status(403).json({ 
        error: 'Accès non autorisé',
        message: 'Vous ne pouvez accéder qu\'à vos propres ressources'
      });
    }
    
    next();
  };
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireStaff,
  requireActiveAccount,
  optionalAuth,
  attachUser,
  requireOwnership
};