// backend/scripts/testEmail.js
// Script pour tester l'envoi d'emails

require('dotenv').config();
const { Pool } = require('pg');
const { initPool } = require('../database/db.js');
const { initEmailService } = require('../services/emailService');
const { 
  sendWelcomeEmail,
  sendReservationCreatedEmail,
  sendProjectUpdateEmail,
  sendPasswordResetEmail
} = require('../utils/emailHelpers');

const testEmail = async () => {
  console.log('\n🧪 Test du système d\'emails\n');

  // Initialiser la base de données
  console.log('🔧 Initialisation de la base de données...');
  let pool;
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ ERREUR: DATABASE_URL non définie dans .env');
      process.exit(1);
    }

    const poolConfig = {
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
      query_timeout: 30000,
      max: 5,
      min: 0,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      application_name: 'lesage_email_test',
      statement_timeout: 30000
    };

    pool = new Pool(poolConfig);
    initPool(pool);
    console.log('✅ Pool DB initialisé\n');
  } catch (error) {
    console.error('❌ Erreur initialisation DB:', error.message);
    process.exit(1);
  }

  // Vérifier la configuration
  console.log('📋 Configuration actuelle:');
  console.log(`  Provider: ${process.env.EMAIL_PROVIDER || 'smtp'}`);
  console.log(`  From: ${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM_ADDRESS}>`);
  console.log(`  SMTP Host: ${process.env.SMTP_HOST}`);
  console.log(`  SMTP User: ${process.env.SMTP_USER}`);
  console.log(`  SMTP Pass: ${process.env.SMTP_PASS ? '***' : 'NON CONFIGURÉ'}`);
  console.log('');

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ ERREUR: SMTP_USER et SMTP_PASS doivent être configurés dans .env');
    console.log('\n📝 Pour configurer Gmail:');
    console.log('  1. Activer la validation en 2 étapes sur votre compte Gmail');
    console.log('  2. Générer un "Mot de passe d\'application"');
    console.log('  3. Utiliser ce mot de passe dans SMTP_PASS');
    console.log('  4. Doc: https://support.google.com/accounts/answer/185833\n');
    process.exit(1);
  }

  // Initialiser le service email
  console.log('🔧 Initialisation du service email...');
  try {
    initEmailService();
    console.log('✅ Service email initialisé\n');
  } catch (error) {
    console.error('❌ Erreur initialisation:', error.message);
    process.exit(1);
  }

  // Demander l'email de test
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const askQuestion = (query) => {
    return new Promise(resolve => rl.question(query, resolve));
  };

  try {
    const testEmailInput = await askQuestion('📧 Entrez l\'email de test (ou appuyez sur Entrée pour utiliser SMTP_USER): ');
    const recipientEmail = testEmailInput.trim() || process.env.SMTP_USER;
    
    console.log(`\n📤 Envoi des emails de test à: ${recipientEmail}\n`);

    // CORRECTION: Récupérer un utilisateur réel de la base de données
    let testUser;
    try {
      // Chercher un utilisateur avec cet email ou prendre le premier utilisateur
      const userQuery = await pool.query(
        `SELECT id, email, firstname, lastname 
         FROM users 
         WHERE email = $1 OR role = 'admin'
         LIMIT 1`,
        [recipientEmail]
      );

      if (userQuery.rows.length > 0) {
        testUser = userQuery.rows[0];
        console.log(`✅ Utilisation de l'utilisateur: ${testUser.firstname} ${testUser.lastname} (${testUser.email})`);
      } else {
        // Créer un utilisateur de test temporaire
        console.log('⚠️  Aucun utilisateur trouvé, création d\'un utilisateur de test...');
        const createUserQuery = await pool.query(
          `INSERT INTO users (email, password_hash, firstname, lastname, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, firstname, lastname`,
          [recipientEmail, 'test-password-hash', 'Test', 'User', 'client']
        );
        testUser = createUserQuery.rows[0];
        console.log(`✅ Utilisateur de test créé: ${testUser.id}`);
      }
    } catch (dbError) {
      console.error('❌ Erreur lors de la récupération/création de l\'utilisateur:', dbError.message);
      process.exit(1);
    }

    console.log('');

    // TEST 1 : Email de bienvenue
    console.log('1️⃣ Test email de bienvenue...');
    const welcomeResult = await sendWelcomeEmail(testUser);
    if (welcomeResult.success) {
      console.log('   ✅ Envoyé (ID:', welcomeResult.messageId, ')');
    } else {
      console.log('   ❌ Échec:', welcomeResult.error);
    }

    // Attendre 2 secondes entre chaque email
    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 2 : Email réservation créée
    console.log('\n2️⃣ Test email réservation créée...');
    const testReservation = {
      id: '00000000-0000-0000-0000-000000000002',
      reservation_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      reservation_time: '14:30',
      meeting_type: 'visio',
      project_type: 'Site vitrine',
      user_id: testUser.id // Utiliser l'ID réel
    };
    const reservationResult = await sendReservationCreatedEmail(testReservation, testUser);
    if (reservationResult.success) {
      console.log('   ✅ Envoyé (ID:', reservationResult.messageId, ')');
    } else {
      console.log('   ❌ Échec:', reservationResult.error);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 3 : Email mise à jour projet
    console.log('\n3️⃣ Test email mise à jour projet...');
    const testProject = {
      id: '00000000-0000-0000-0000-000000000003',
      title: 'Mon Super Projet',
      user_id: testUser.id // Utiliser l'ID réel
    };
    const testUpdate = {
      id: '00000000-0000-0000-0000-000000000004',
      update_type: 'milestone',
      message: 'Les maquettes de votre site sont prêtes ! Vous pouvez les consulter dans votre espace client.',
      title: 'Maquettes terminées'
    };
    const updateResult = await sendProjectUpdateEmail(testProject, testUser, testUpdate);
    if (updateResult.success) {
      console.log('   ✅ Envoyé (ID:', updateResult.messageId, ')');
    } else {
      console.log('   ❌ Échec:', updateResult.error);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // TEST 4 : Email reset password
    console.log('\n4️⃣ Test email reset password...');
    const resetToken = 'test-token-123456789';
    const passwordResult = await sendPasswordResetEmail(testUser, resetToken);
    if (passwordResult.success) {
      console.log('   ✅ Envoyé (ID:', passwordResult.messageId, ')');
    } else {
      console.log('   ❌ Échec:', passwordResult.error);
    }

    console.log('\n✅ Tests terminés !');
    console.log('\n📬 Vérifiez votre boîte email:', recipientEmail);
    console.log('   (Pensez à vérifier les spams si vous ne voyez rien)\n');

  } catch (error) {
    console.error('\n❌ Erreur durant les tests:', error);
  } finally {
    rl.close();
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  }
};

// Exécuter les tests
if (require.main === module) {
  testEmail();
}

module.exports = { testEmail };