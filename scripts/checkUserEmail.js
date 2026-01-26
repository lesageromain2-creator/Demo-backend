// Script pour vérifier les préférences email d'un utilisateur
require('dotenv').config();
const { Pool } = require('pg');
const { initPool } = require('../database/db.js');

const checkUserEmail = async (userEmail) => {
  console.log(`🔍 Vérification des préférences email pour: ${userEmail}`);
  
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
    // Vérifier si l'utilisateur existe
    const userResult = await pool.query(
      'SELECT id, email, firstname, lastname FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ Utilisateur trouvé:', user);

    // Vérifier les préférences email
    const prefsResult = await pool.query(
      'SELECT * FROM email_preferences WHERE user_id = $1',
      [user.id]
    );

    if (prefsResult.rows.length === 0) {
      console.log('❌ Aucune préférence email trouvée');
      // Créer les préférences par défaut
      await pool.query(`
        INSERT INTO email_preferences (user_id)
        VALUES ($1)
      `, [user.id]);
      console.log('✅ Préférences email créées par défaut');
    } else {
      console.log('✅ Préférences email trouvées:', prefsResult.rows[0]);
    }

    // Vérifier les logs d'emails récents
    const logsResult = await pool.query(`
      SELECT * FROM email_logs 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 5
    `, [user.id]);

    console.log(`📧 Logs d'emails récents (${logsResult.rows.length}):`);
    logsResult.rows.forEach(log => {
      console.log(`  - ${log.email_type}: ${log.status} (${log.created_at})`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await pool.end();
  }
};

// Vérifier l'email du client
checkUserEmail('gurtler.pro@gmail.com');
