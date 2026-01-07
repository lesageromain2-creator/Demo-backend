const express = require('express');
const router = express.Router();
const pool = require('../database/db');

/**
 * GET /api/menus
 * Récupère tous les menus actifs avec leurs plats
 */
router.get('/', async (req, res) => {
  try {
    console.log('📋 Récupération de tous les menus...');
    
    const menusQuery = `
      SELECT 
        m.id_menu,
        m.title,
        m.description,
        m.price,
        m.image,
        m.menu_type,
        m.is_active,
        m.available_from,
        m.available_until,
        m.display_order
      FROM menus m
      WHERE m.is_active = true
        AND (m.available_from IS NULL OR m.available_from <= CURRENT_DATE)
        AND (m.available_until IS NULL OR m.available_until >= CURRENT_DATE)
      ORDER BY m.display_order ASC, m.title ASC
    `;

    const menusResult = await pool.query(menusQuery);
    
    // Le résultat est directement le tableau, pas result.rows
    const menus = Array.isArray(menusResult) ? menusResult : [];
    
    console.log(`✅ ${menus.length} menus trouvés`);

    // Si aucun menu, retourner un tableau vide
    if (menus.length === 0) {
      return res.json({
        success: true,
        menus: []
      });
    }

    // Pour chaque menu, récupérer les plats associés
    const menusWithDishes = await Promise.all(
      menus.map(async (menu) => {
        const dishesQuery = `
          SELECT 
            d.id_dish,
            d.name,
            d.description,
            d.price as dish_price,
            d.image_url,
            d.allergens,
            d.is_vegetarian,
            d.is_vegan,
            d.is_gluten_free,
            d.course_type,
            md.course_order,
            md.is_optional,
            c.name as category_name
          FROM menu_dishes md
          JOIN dishes d ON md.dish_id = d.id_dish
          LEFT JOIN categories c ON d.category_id = c.id_category
          WHERE md.menu_id = $1
            AND d.is_available = true
          ORDER BY md.course_order ASC
        `;

        const dishesResult = await pool.query(dishesQuery, [menu.id_menu]);
        const dishes = Array.isArray(dishesResult) ? dishesResult : [];

        return {
          ...menu,
          dishes: dishes,
          dish_count: dishes.length
        };
      })
    );

    res.json({
      success: true,
      menus: menusWithDishes
    });
  } catch (error) {
    console.error('❌ Erreur récupération menus:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des menus',
      error: error.message
    });
  }
});

/**
 * GET /api/menus/dishes/all
 * Récupère tous les plats disponibles
 */
router.get('/dishes/all', async (req, res) => {
  try {
    const dishesQuery = `
      SELECT 
        d.id_dish,
        d.name,
        d.description,
        d.price,
        d.image_url,
        d.allergens,
        d.is_vegetarian,
        d.is_vegan,
        d.is_gluten_free,
        d.course_type,
        d.preparation_time,
        c.name as category_name,
        c.icon as category_icon
      FROM dishes d
      LEFT JOIN categories c ON d.category_id = c.id_category
      WHERE d.is_available = true
      ORDER BY c.display_order ASC, d.name ASC
    `;

    const result = await pool.query(dishesQuery);
    const dishes = Array.isArray(result) ? result : [];

    res.json({
      success: true,
      dishes: dishes
    });
  } catch (error) {
    console.error('Erreur récupération plats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des plats'
    });
  }
});

/**
 * GET /api/menus/dishes/category/:categoryId
 * Récupère les plats d'une catégorie spécifique
 */
router.get('/dishes/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const dishesQuery = `
      SELECT 
        d.id_dish,
        d.name,
        d.description,
        d.price,
        d.image_url,
        d.allergens,
        d.is_vegetarian,
        d.is_vegan,
        d.is_gluten_free,
        d.course_type
      FROM dishes d
      WHERE d.category_id = $1
        AND d.is_available = true
      ORDER BY d.name ASC
    `;

    const result = await pool.query(dishesQuery, [categoryId]);
    const dishes = Array.isArray(result) ? result : [];

    res.json({
      success: true,
      dishes: dishes
    });
  } catch (error) {
    console.error('Erreur récupération plats par catégorie:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des plats'
    });
  }
});

/**
 * GET /api/menus/categories/all
 * Récupère toutes les catégories actives
 */
router.get('/categories/all', async (req, res) => {
  try {
    const categoriesQuery = `
      SELECT 
        c.id_category,
        c.name,
        c.description,
        c.icon,
        c.display_order,
        COUNT(d.id_dish) as dish_count
      FROM categories c
      LEFT JOIN dishes d ON c.id_category = d.category_id AND d.is_available = true
      WHERE c.is_active = true
      GROUP BY c.id_category
      ORDER BY c.display_order ASC
    `;

    const result = await pool.query(categoriesQuery);
    const categories = Array.isArray(result) ? result : [];

    res.json({
      success: true,
      categories: categories
    });
  } catch (error) {
    console.error('Erreur récupération catégories:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des catégories'
    });
  }
});

/**
 * GET /api/menus/type/:type
 * Récupère les menus par type (standard, seasonal, special, tasting, chef)
 */
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;

    const menusQuery = `
      SELECT 
        m.id_menu,
        m.title,
        m.description,
        m.price,
        m.image,
        m.menu_type,
        m.display_order
      FROM menus m
      WHERE m.is_active = true
        AND m.menu_type = $1
        AND (m.available_from IS NULL OR m.available_from <= CURRENT_DATE)
        AND (m.available_until IS NULL OR m.available_until >= CURRENT_DATE)
      ORDER BY m.display_order ASC
    `;

    const result = await pool.query(menusQuery, [type]);
    const menus = Array.isArray(result) ? result : [];

    res.json({
      success: true,
      menus: menus
    });
  } catch (error) {
    console.error('Erreur récupération menus par type:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des menus'
    });
  }
});

/**
 * GET /api/menus/:id
 * Récupère un menu spécifique avec tous ses détails
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📋 Récupération du menu ${id}...`);

    // Récupérer le menu
    const menuQuery = `
      SELECT 
        m.id_menu,
        m.title,
        m.description,
        m.price,
        m.image,
        m.menu_type,
        m.is_active,
        m.available_from,
        m.available_until,
        m.display_order,
        m.created_at
      FROM menus m
      WHERE m.id_menu = $1 AND m.is_active = true
    `;

    const menuResult = await pool.query(menuQuery, [id]);
    const menus = Array.isArray(menuResult) ? menuResult : [];

    if (menus.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Menu non trouvé'
      });
    }

    const menu = menus[0];

    // Récupérer les plats du menu groupés par type de plat
    const dishesQuery = `
      SELECT 
        d.id_dish,
        d.name,
        d.description,
        d.price as dish_price,
        d.image_url,
        d.allergens,
        d.is_vegetarian,
        d.is_vegan,
        d.is_gluten_free,
        d.course_type,
        d.preparation_time,
        d.calories,
        md.course_order,
        md.is_optional,
        c.name as category_name,
        c.icon as category_icon
      FROM menu_dishes md
      JOIN dishes d ON md.dish_id = d.id_dish
      LEFT JOIN categories c ON d.category_id = c.id_category
      WHERE md.menu_id = $1
        AND d.is_available = true
      ORDER BY md.course_order ASC
    `;

    const dishesResult = await pool.query(dishesQuery, [id]);
    const dishes = Array.isArray(dishesResult) ? dishesResult : [];
    
    console.log(`✅ Menu trouvé avec ${dishes.length} plats`);

    res.json({
      success: true,
      ...menu,
      dishes: dishes,
      dish_count: dishes.length
    });
  } catch (error) {
    console.error('Erreur récupération menu:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du menu'
    });
  }
});

module.exports = router;