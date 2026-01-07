// backend/routes/dishes.js
const express = require('express');
//const { query, queryOne } = require('../../database/db');

const router = express.Router();

// Récupérer tous les plats avec filtres
router.get('/', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      category, 
      active = 1,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    let sql = `
      SELECT d.*, c.name as category_name,
             (SELECT COUNT(*) FROM favorites WHERE id_dish = d.id_dish) as favorite_count
      FROM dishes d 
      LEFT JOIN categories c ON d.id_category = c.id_category 
      WHERE d.active = ?
    `;
    const params = [active];

    if (category) {
      sql += ' AND d.id_category = ?';
      params.push(category);
    }

    sql += ` ORDER BY d.${sort} ${order} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const dishes = await query(sql, params);

    // Compter le total
    let countSql = 'SELECT COUNT(*) as total FROM dishes WHERE active = ?';
    const countParams = [active];
    if (category) {
      countSql += ' AND id_category = ?';
      countParams.push(category);
    }
    const [{ total }] = await query(countSql, countParams);

    res.json({
      dishes,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Erreur get dishes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer un plat par ID
router.get('/:id', async (req, res) => {
  try {
    const dish = await queryOne(
      `SELECT d.*, c.name as category_name,
              (SELECT COUNT(*) FROM favorites WHERE id_dish = d.id_dish) as favorite_count
       FROM dishes d 
       LEFT JOIN categories c ON d.id_category = c.id_category 
       WHERE d.id_dish = ?`,
      [req.params.id]
    );

    if (!dish) {
      return res.status(404).json({ error: 'Plat non trouvé' });
    }

    // Vérifier si l'utilisateur l'a en favori
    if (req.session.userId) {
      const favorite = await queryOne(
        'SELECT * FROM favorites WHERE id_user = ? AND id_dish = ?',
        [req.session.userId, dish.id_dish]
      );
      dish.is_favorite = !!favorite;
    }

    res.json(dish);
  } catch (error) {
    console.error('Erreur get dish:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rechercher des plats
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Recherche trop courte' });
    }

    const searchTerm = `%${q}%`;
    const dishes = await query(
      `SELECT d.*, c.name as category_name
       FROM dishes d 
       LEFT JOIN categories c ON d.id_category = c.id_category 
       WHERE d.active = 1 
       AND (d.name LIKE ? OR d.description LIKE ?)
       ORDER BY d.name ASC
       LIMIT 20`,
      [searchTerm, searchTerm]
    );

    res.json({ dishes, query: q });
  } catch (error) {
    console.error('Erreur search dishes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un plat (admin uniquement)
router.post('/', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description, price, id_category, allergens, image } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Nom et prix requis' });
    }

    const result = await query(
      `INSERT INTO dishes (name, description, price, id_category, allergens, image, active, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
      [name, description, price, id_category, allergens, image]
    );

    res.status(201).json({
      message: 'Plat créé avec succès',
      id_dish: result.insertId
    });
  } catch (error) {
    console.error('Erreur create dish:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mettre à jour un plat (admin uniquement)
router.put('/:id', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, description, price, id_category, allergens, image, active } = req.body;

    await query(
      `UPDATE dishes 
       SET name = ?, description = ?, price = ?, id_category = ?, 
           allergens = ?, image = ?, active = ?
       WHERE id_dish = ?`,
      [name, description, price, id_category, allergens, image, active, req.params.id]
    );

    res.json({ message: 'Plat mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur update dish:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un plat (admin uniquement)
router.delete('/:id', async (req, res) => {
  try {
    if (!req.session.userId || req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    await query('DELETE FROM dishes WHERE id_dish = ?', [req.params.id]);

    res.json({ message: 'Plat supprimé avec succès' });
  } catch (error) {
    console.error('Erreur delete dish:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;