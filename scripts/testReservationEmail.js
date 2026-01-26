// Script pour tester l'envoi d'email de réservation pour un client spécifique
require('dotenv').config();
const { Pool } = require('pg');
const { initPool } = require('../database/db.js');
const { sendReservationCreatedEmail } = require('../utils/emailHelpers.js');

const testReservationEmail = async () => {
  console.log('🧪 Test email de réservation pour client gurtler.pro@gmail.com\n');
  
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
    // Récupérer l'utilisateur gurtler.pro@gmail.com
    const userResult = await pool.query(
      'SELECT id, email, firstname, lastname FROM users WHERE email = $1',
      ['gurtler.pro@gmail.com']
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Utilisateur gurtler.pro@gmail.com non trouvé');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ Utilisateur trouvé:', user);

    // Créer une réservation de test
    const testReservation = {
      id: 'test-reservation-' + Date.now(),
      reservation_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 jours dans le futur
      reservation_time: '14:30',
      meeting_type: 'visio',
      project_type: 'Site vitrine',
      user_id: user.id
    };

    console.log('📋 Réservation de test:', testReservation);

    // Envoyer l'email
    console.log('\n📤 Envoi de l\'email de réservation...');
    const result = await sendReservationCreatedEmail(testReservation, user);

    if (result.success) {
      console.log('✅ Email envoyé avec succès !');
      console.log('   Message ID:', result.messageId);
      console.log('   Destinataire:', user.email);
    } else {
      console.log('❌ Échec de l\'envoi:', result.error);
    }

    // Vérifier les logs
    const logsResult = await pool.query(`
      SELECT * FROM email_logs 
      WHERE user_id = $1 AND email_type = 'reservation_created'
      ORDER BY created_at DESC 
      LIMIT 1
    `, [user.id]);

    if (logsResult.rows.length > 0) {
      console.log('\n📊 Dernier log d\'email:', logsResult.rows[0]);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
};

testReservationEmail();
