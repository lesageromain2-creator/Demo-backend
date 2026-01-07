// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const { query, queryOne } = require('../database/db');

// Middleware pour vérifier que l'utilisateur est admin
const requireAdmin = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé - Admin requis' });
  }
  next();
};

// ============================================
// RÉCUPÉRER LES PARAMÈTRES DU SITE
// ============================================
router.get('/', async (req, res) => {
  try {
    const settings = await query('SELECT * FROM settings ORDER BY setting_key');
    
    // Transformer en objet clé-valeur
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.setting_key] = setting.setting_value;
    });

    res.json(settingsObj);
  } catch (error) {
    console.error('Erreur get settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// RÉCUPÉRER UN PARAMÈTRE SPÉCIFIQUE
// ============================================
router.get('/:key', async (req, res) => {
  try {
    const setting = await queryOne(
      'SELECT * FROM settings WHERE setting_key = $1',
      [req.params.key]
    );

    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }

    res.json(setting);
  } catch (error) {
    console.error('Erreur get setting:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// METTRE À JOUR UN PARAMÈTRE
// ============================================
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const { setting_value } = req.body;

    if (!setting_value) {
      return res.status(400).json({ error: 'Valeur requise' });
    }

    // Vérifier si le paramètre existe
    const exists = await queryOne(
      'SELECT * FROM settings WHERE setting_key = $1',
      [req.params.key]
    );

    if (exists) {
      // Mettre à jour
      await query(
        'UPDATE settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
        [setting_value, req.params.key]
      );
    } else {
      // Créer
      await query(
        'INSERT INTO settings (setting_key, setting_value, created_at) VALUES ($1, $2, NOW())',
        [req.params.key, setting_value]
      );
    }

    res.json({ message: 'Paramètre mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur update setting:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// METTRE À JOUR PLUSIEURS PARAMÈTRES
// ============================================
router.put('/', requireAdmin, async (req, res) => {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Format invalide' });
    }

    // Mettre à jour chaque paramètre
    for (const [key, value] of Object.entries(settings)) {
      const exists = await queryOne(
        'SELECT * FROM settings WHERE setting_key = $1',
        [key]
      );

      if (exists) {
        await query(
          'UPDATE settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2',
          [value, key]
        );
      } else {
        await query(
          'INSERT INTO settings (setting_key, setting_value, created_at) VALUES ($1, $2, NOW())',
          [key, value]
        );
      }
    }

    res.json({ message: 'Paramètres mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur update settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// SUPPRIMER UN PARAMÈTRE
// ============================================
router.delete('/:key', requireAdmin, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM settings WHERE setting_key = $1 RETURNING *',
      [req.params.key]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }

    res.json({ message: 'Paramètre supprimé avec succès' });
  } catch (error) {
    console.error('Erreur delete setting:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;