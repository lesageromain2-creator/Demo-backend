// backend/routes/categories.js
const express = require('express');
const { query, queryOne } = require('../../database/db');

const router = express.Router();

// Récupérer toutes les catégories avec comptage de plats
router.get('/', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const categories = await query(
      `SELECT c.*, 
              COUNT(CASE WHEN d.active = 1 THEN 1 END) as dish_count 
       FROM categories c 
       LEFT JOIN dishes d ON c.id_category = d.id_category 
       GROUP BY c.id_category 
       ORDER BY dish_count DESC 
       LIMIT ?`,
      [parseInt(limit)]
    );

    const [{ total }] = await query('SELECT COUNT(*) as total FROM categories');

    res.json({
      categories,
      total
    });
  } catch (error) {
    console.error('Erreur get categories:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer une catégorie par ID
router.get('/:id', async (req, res) => {
  try {
    const category = await queryOne(
      `SELECT c.*, 
              COUNT(CASE WHEN d.active = 1 THEN 1 END) as dish_count 
       FROM categories c 
       LEFT JOIN dishes d ON c.id_category = d.id_category 
       WHERE c.id_category = ?
       GROUP BY c.id_category`,
      [req.params.id]
    );

    if (!category) {
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }

    res.json(category);
  } catch (error) {
    console.error('Erreur get category:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les plats d'une catégorie
router.get('/:id/dishes', async (req, res) => {
  try {
    const dishes = await query(
      `SELECT d.*, c.name as category_name
       FROM dishes d 
       LEFT JOIN categories c ON d.id_category = c.id_category 
       WHERE d.id_category = ? AND d.active = 1
       ORDER BY d.name ASC`,
      [req.params.id]
    );

    res.json({ dishes });
  } catch (error) {
    console.error('Erreur get dishes by category:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une catégorie (admin uniquement)
router.post('/', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nom requis' });
    }

    const result = await query(
      'INSERT INTO categories (name, description, created_at) VALUES (?, ?, NOW())',
      [name, description]
    );

    res.status(201).json({
      message: 'Catégorie créée avec succès',
      id_category: result.insertId
    });
  } catch (error) {
    console.error('Erreur create category:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour une catégorie (admin uniquement)
router.put('/:id', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description } = req.body;

    await query(
      'UPDATE categories SET name = ?, description = ? WHERE id_category = ?',
      [name, description, req.params.id]
    );

    res.json({ message: 'Catégorie mise à jour avec succès' });
  } catch (error) {
    console.error('Erreur update category:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une catégorie (admin uniquement)
router.delete('/:id', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Vérifier si des plats utilisent cette catégorie
    const [{ count }] = await query(
      'SELECT COUNT(*) as count FROM dishes WHERE id_category = ?',
      [req.params.id]
    );

    if (count > 0) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer : des plats utilisent cette catégorie' 
      });
    }

    await query('DELETE FROM categories WHERE id_category = ?', [req.params.id]);

    res.json({ message: 'Catégorie supprimée avec succès' });
  } catch (error) {
    console.error('Erreur delete category:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;