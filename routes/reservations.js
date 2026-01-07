// backend/routes/reservations.js
const express = require('express');
const { query, queryOne } = require('../database/db');

const router = express.Router();

// Middleware pour vérifier l'authentification
const requireAuth = (req, res, next) => {
  console.log('🔒 requireAuth - Session complète:', {
    sessionID: req.sessionID,
    session: req.session,
    userId: req.session?.userId,
    role: req.session?.role,
    cookie: req.session?.cookie
  });

  if (!req.session || !req.session.userId) {
    console.log('❌ Authentification échouée - pas de session userId');
    return res.status(401).json({ 
      error: 'Non authentifié',
      authenticated: false,
      message: 'Vous devez être connecté pour effectuer cette action'
    });
  }
  
  console.log('✅ Authentification réussie - userId:', req.session.userId);
  next();
};

// ============================================
// VÉRIFIER LES DISPONIBILITÉS (PUBLIC)
// ============================================
router.post('/check-availability', async (req, res) => {
  try {
    const { reservation_date, reservation_time, number_of_people } = req.body;

    if (!reservation_date || !reservation_time || !number_of_people) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    // Déterminer le service (déjeuner ou dîner)
    const hour = parseInt(reservation_time.split(':')[0]);
    const isLunchTime = hour >= 12 && hour < 15;

    const availabilityResult = await query(
      `SELECT COALESCE(SUM(number_of_people), 0) as total_people
       FROM reservations 
       WHERE reservation_date = $1
       AND reservation_time BETWEEN $2 AND $3
       AND status IN ('confirmed', 'pending')`,
      [
        reservation_date,
        isLunchTime ? '12:00:00' : '19:00:00',
        isLunchTime ? '14:30:00' : '22:30:00'
      ]
    );

    const totalPeople = parseInt(availabilityResult[0].total_people);
    const availableSeats = 50 - totalPeople;
    const isAvailable = availableSeats >= parseInt(number_of_people);

    res.json({
      available: isAvailable,
      available_seats: availableSeats,
      requested_seats: parseInt(number_of_people)
    });
  } catch (error) {
    console.error('Erreur check availability:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// CRÉER UNE RÉSERVATION
// ============================================
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      reservation_date,
      reservation_time,
      number_of_people,
      special_requests
    } = req.body;

    console.log('📝 Création réservation pour user:', req.session.userId);
    console.log('📋 Données reçues:', { reservation_date, reservation_time, number_of_people });

    // Validation
    if (!reservation_date || !reservation_time || !number_of_people) {
      return res.status(400).json({ 
        error: 'Date, heure et nombre de personnes requis' 
      });
    }

    if (number_of_people < 1 || number_of_people > 20) {
      return res.status(400).json({ 
        error: 'Le nombre de personnes doit être entre 1 et 20' 
      });
    }

    // Vérifier que la date est future
    const reservationDateTime = new Date(`${reservation_date}T${reservation_time}`);
    if (reservationDateTime < new Date()) {
      return res.status(400).json({ 
        error: 'La date de réservation doit être future' 
      });
    }

    // Vérifier les horaires d'ouverture (12h-14h30, 19h-22h30)
    const [hour, minute] = reservation_time.split(':').map(Number);
    const timeInMinutes = hour * 60 + minute;

    const lunchStart = 12 * 60;
    const lunchEnd = 14 * 60 + 30;
    const dinnerStart = 19 * 60;
    const dinnerEnd = 22 * 60 + 30;

    const isLunchTime = timeInMinutes >= lunchStart && timeInMinutes <= lunchEnd;
    const isDinnerTime = timeInMinutes >= dinnerStart && timeInMinutes <= dinnerEnd;

    if (!isLunchTime && !isDinnerTime) {
      return res.status(400).json({ 
        error: 'Horaires de réservation : 12h-14h30 et 19h-22h30' 
      });
    }

    // Vérifier la disponibilité (max 50 personnes par service)
    const availabilityResult = await query(
      `SELECT COALESCE(SUM(number_of_people), 0) as total_people
       FROM reservations 
       WHERE reservation_date = $1
       AND reservation_time BETWEEN $2 AND $3
       AND status IN ('confirmed', 'pending')`,
      [
        reservation_date,
        isLunchTime ? '12:00:00' : '19:00:00',
        isLunchTime ? '14:30:00' : '22:30:00'
      ]
    );

    const totalPeople = parseInt(availabilityResult[0].total_people);

    if (totalPeople + parseInt(number_of_people) > 50) {
      return res.status(400).json({ 
        error: 'Plus de disponibilité pour ce créneau',
        available_seats: 50 - totalPeople
      });
    }

    // Créer la réservation
    const result = await query(
      `INSERT INTO reservations 
       (user_id, reservation_date, reservation_time, number_of_people, special_requests, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, user_id, reservation_date, reservation_time, number_of_people, status, created_at`,
      [req.session.userId, reservation_date, reservation_time, number_of_people, special_requests || null]
    );

    console.log('✅ Réservation créée:', result[0]);

    res.status(201).json({
      success: true,
      message: 'Réservation créée avec succès',
      reservation: result[0]
    });
  } catch (error) {
    console.error('❌ Erreur create reservation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur lors de la création de la réservation' 
    });
  }
});

// ============================================
// RÉCUPÉRER LES RÉSERVATIONS DE L'UTILISATEUR
// ============================================
router.get('/my', requireAuth, async (req, res) => {
  try {
    console.log('📋 Récupération réservations pour user:', req.session.userId);
    
    const reservations = await query(
      `SELECT * FROM reservations 
       WHERE user_id = $1 
       ORDER BY reservation_date DESC, reservation_time DESC`,
      [req.session.userId]
    );

    console.log(`✅ ${reservations.length} réservations trouvées`);

    res.json({ 
      success: true,
      reservations 
    });
  } catch (error) {
    console.error('❌ Erreur get my reservations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// ============================================
// RÉCUPÉRER UNE RÉSERVATION PAR ID
// ============================================
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const reservation = await queryOne(
      `SELECT r.*, u.firstname, u.lastname, u.email, u.phone
       FROM reservations r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (!reservation) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }

    // Vérifier que l'utilisateur est le propriétaire ou admin
    if (reservation.user_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    res.json({
      success: true,
      reservation
    });
  } catch (error) {
    console.error('❌ Erreur get reservation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// ============================================
// ANNULER UNE RÉSERVATION
// ============================================
router.put('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const reservation = await queryOne(
      'SELECT * FROM reservations WHERE id = $1',
      [req.params.id]
    );

    if (!reservation) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }

    // Vérifier que l'utilisateur est le propriétaire
    if (reservation.user_id !== req.session.userId && req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Vérifier que la réservation n'est pas déjà annulée
    if (reservation.status === 'cancelled') {
      return res.status(400).json({ error: 'Réservation déjà annulée' });
    }

    // Vérifier que la réservation est au moins 2h dans le futur
    const reservationDateTime = new Date(`${reservation.reservation_date}T${reservation.reservation_time}`);
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);

    if (reservationDateTime < twoHoursFromNow) {
      return res.status(400).json({ 
        error: 'Impossible d\'annuler moins de 2h avant la réservation' 
      });
    }

    await query(
      'UPDATE reservations SET status = $1, cancelled_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', req.params.id]
    );

    res.json({ 
      success: true,
      message: 'Réservation annulée avec succès' 
    });
  } catch (error) {
    console.error('❌ Erreur cancel reservation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// ============================================
// ADMIN: RÉCUPÉRER TOUTES LES RÉSERVATIONS
// ============================================
router.get('/admin/all', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { date, status } = req.query;
    let sql = `
      SELECT r.*, u.firstname, u.lastname, u.email, u.phone
      FROM reservations r
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (date) {
      sql += ` AND r.reservation_date = $${paramIndex}`;
      params.push(date);
      paramIndex++;
    }

    if (status) {
      sql += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    sql += ' ORDER BY r.reservation_date DESC, r.reservation_time DESC';

    const reservations = await query(sql, params);

    res.json({ 
      success: true,
      reservations 
    });
  } catch (error) {
    console.error('❌ Erreur get all reservations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// ============================================
// ADMIN: CONFIRMER UNE RÉSERVATION
// ============================================
router.put('/:id/confirm', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    await query(
      'UPDATE reservations SET status = $1 WHERE id = $2',
      ['confirmed', req.params.id]
    );

    res.json({ 
      success: true,
      message: 'Réservation confirmée avec succès' 
    });
  } catch (error) {
    console.error('❌ Erreur confirm reservation:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

module.exports = router;