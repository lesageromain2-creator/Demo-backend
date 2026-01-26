// Script pour tester une réservation complète comme un client
require('dotenv').config();
const { Pool } = require('pg');
const { initPool } = require('../database/db.js');
const jwt = require('jsonwebtoken');

const testFullReservation = async () => {
  console.log('🧪 Test réservation complète pour gurtler.pro@gmail.com\n');
  
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

    // 2. Générer un token JWT (comme si le client était connecté)
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: 'client'
      },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      { expiresIn: '7d' }
    );

    console.log('✅ Token JWT généré');

    // 3. Simuler une réservation
    const reservationData = {
      reservation_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reservation_time: '14:30',
      meeting_type: 'visio',
      project_type: 'Site vitrine',
      estimated_budget: '5000-10000',
      message: 'Test de réservation complète'
    };

    console.log('📋 Données de réservation:', reservationData);

    // 4. Appeler la route POST /reservations
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    const response = await fetch(`${API_URL}/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(reservationData)
    });

    const result = await response.json();
    console.log('📡 Réponse API:', response.status, result);

    if (response.ok) {
      console.log('✅ Réservation créée avec succès !');
      console.log('   ID:', result.reservation?.id);
      
      // 5. Vérifier les logs d'emails
      await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2s
      
      const logsResult = await pool.query(`
        SELECT * FROM email_logs 
        WHERE user_id = $1 AND email_type = 'reservation_created'
        ORDER BY created_at DESC 
        LIMIT 1
      `, [user.id]);

      if (logsResult.rows.length > 0) {
        console.log('✅ Email envoyé avec succès !');
        console.log('   Destinataire:', logsResult.rows[0].recipient_email);
        console.log('   Status:', logsResult.rows[0].status);
        console.log('   Message ID:', logsResult.rows[0].provider_message_id);
      } else {
        console.log('❌ Aucun log d\'email trouvé');
      }

    } else {
      console.log('❌ Erreur lors de la réservation:', result.error);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
};

testFullReservation();
