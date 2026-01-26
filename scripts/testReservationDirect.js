// Test direct de la création de réservation avec email
require('dotenv').config();
const { Pool } = require('pg');
const { initPool } = require('../database/db.js');
const { sendReservationCreatedEmail } = require('../utils/emailHelpers.js');

const testReservationDirect = async () => {
  console.log('🧪 Test direct réservation + email\n');
  
  // Initialiser la base de données
  const dbUrl = process.env.DATABASE_URL;
  const poolConfig = {
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60000,
    max: 5
  };

  const pool = new Pool(poolConfig);
  initPool(pool);

  try {
    // 1. Récupérer l'utilisateur
    const userResult = await pool.query(
      'SELECT id, email, firstname, lastname FROM users WHERE email = $1',
      ['gurtler.pro@gmail.com']
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ Utilisateur trouvé:', user);

    // 2. Créer une réservation directement en base
    const reservationData = {
      reservation_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reservation_time: '15:00',
      meeting_type: 'visio',
      project_type: 'Site vitrine',
      estimated_budget: '5000-10000',
      message: 'Test direct réservation'
    };

    const insertResult = await pool.query(`
      INSERT INTO reservations 
      (user_id, reservation_date, reservation_time, meeting_type, project_type, estimated_budget, message, status) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [
      user.id,
      reservationData.reservation_date,
      reservationData.reservation_time,
      reservationData.meeting_type,
      reservationData.project_type,
      reservationData.estimated_budget,
      reservationData.message
    ]);

    const reservation = insertResult.rows[0];
    console.log('✅ Réservation créée:', reservation);

    // 3. Envoyer l'email
    console.log('📧 Envoi email de confirmation...');
    const emailResult = await sendReservationCreatedEmail(reservation, user);

    if (emailResult.success) {
      console.log('✅ Email envoyé avec succès !');
      console.log('   Destinataire:', user.email);
      console.log('   Message ID:', emailResult.messageId);
    } else {
      console.log('❌ Erreur envoi email:', emailResult.error);
    }

    // 4. Vérifier les logs
    const logsResult = await pool.query(`
      SELECT * FROM email_logs 
      WHERE user_id = $1 AND email_type = 'reservation_created'
      ORDER BY created_at DESC 
      LIMIT 1
    `, [user.id]);

    if (logsResult.rows.length > 0) {
      console.log('✅ Log email trouvé:', {
        recipient: logsResult.rows[0].recipient_email,
        status: logsResult.rows[0].status,
        message_id: logsResult.rows[0].provider_message_id
      });
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
};

testReservationDirect();
