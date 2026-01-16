// backend/routes/categories.js - VERSION CORRIGÉE POUR POSTGRESQL
const express = require('express');
const router = express.Router();

// Récupérer toutes les catégories avec comptage de plats
router.get('/', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const { limit = 50 } = req.query;

    // ✅ CORRECTION: Syntaxe PostgreSQL avec $1 au lieu de ?
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(CASE WHEN d.is_available = true THEN 1 END) as dish_count
      FROM categories c
      LEFT JOIN dishes d ON c.id_category = d.category_id
      GROUP BY c.id_category
      ORDER BY c.display_order ASC, dish_count DESC
      LIMIT $1
    `, [parseInt(limit)]);

    const totalResult = await pool.query('SELECT COUNT(*) as total FROM categories');
    const total = parseInt(totalResult.rows[0].total);

    res.json({
      success: true,
      categories: result.rows,
      total
    });
  } catch (error) {
    console.error('❌ Erreur GET /categories:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer une catégorie par ID
router.get('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(CASE WHEN d.is_available = true THEN 1 END) as dish_count
      FROM categories c
      LEFT JOIN dishes d ON c.id_category = d.category_id
      WHERE c.id_category = $1
      GROUP BY c.id_category
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    res.json({
      success: true,
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur GET /categories/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les plats d'une catégorie
router.get('/:id/dishes', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        c.name as category_name,
        c.icon as category_icon
      FROM dishes d
      LEFT JOIN categories c ON d.category_id = c.id_category
      WHERE d.category_id = $1 AND d.is_available = true
      ORDER BY d.name ASC
    `, [req.params.id]);

    res.json({ 
      success: true,
      dishes: result.rows 
    });
  } catch (error) {
    console.error('❌ Erreur GET /categories/:id/dishes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une catégorie (admin uniquement)
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description, icon, display_order } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }

    const result = await pool.query(`
      INSERT INTO categories (name, description, icon, display_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `, [name, description, icon || null, display_order || 0]);

    res.status(201).json({
      success: true,
      message: 'Catégorie créée avec succès',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur POST /categories:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour une catégorie (admin uniquement)
router.put('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description, icon, display_order, is_active } = req.body;

    const result = await pool.query(`
      UPDATE categories 
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        icon = COALESCE($3, icon),
        display_order = COALESCE($4, display_order),
        is_active = COALESCE($5, is_active),
        updated_at = NOW()
      WHERE id_category = $6
      RETURNING *
    `, [name, description, icon, display_order, is_active, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    res.json({ 
      success: true,
      message: 'Catégorie mise à jour avec succès',
      category: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur PUT /categories/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une catégorie (admin uniquement)
router.delete('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Vérifier si des plats utilisent cette catégorie
    const dishCheck = await pool.query(
      'SELECT COUNT(*) as count FROM dishes WHERE category_id = $1',
      [req.params.id]
    );

    if (parseInt(dishCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer : des plats utilisent cette catégorie' 
      });
    }

    const result = await pool.query(
      'DELETE FROM categories WHERE id_category = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    res.json({ 
      success: true,
      message: 'Catégorie supprimée avec succès' 
    });
  } catch (error) {
    console.error('❌ Erreur DELETE /categories/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;