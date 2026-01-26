// backend/scripts/initEmailTables.js
// Script pour initialiser les tables emails dans la base de données

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const initEmailTables = async () => {
  console.log('\n🚀 Initialisation des tables emails...\n');

  try {
    // Lire le fichier SQL
    const sqlPath = path.join(__dirname, '..', '..', 'supabase', 'email_tables.sql');
    
    // Si le fichier n'existe pas, créer les tables directement
    console.log('📝 Création des tables...');

    // Table email_logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        email_type VARCHAR(100) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        template_name VARCHAR(100),
        context JSONB,
        variables JSONB,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'delivered', 'opened', 'clicked')),
        error_message TEXT,
        provider VARCHAR(50) DEFAULT 'nodemailer',
        provider_message_id VARCHAR(255),
        sent_at TIMESTAMP WITH TIME ZONE,
        delivered_at TIMESTAMP WITH TIME ZONE,
        opened_at TIMESTAMP WITH TIME ZONE,
        clicked_at TIMESTAMP WITH TIME ZONE,
        bounced_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table email_logs créée');

    // Table email_templates
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_key VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(500) NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT,
        available_variables JSONB,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        version INTEGER DEFAULT 1,
        last_used_at TIMESTAMP WITH TIME ZONE,
        usage_count INTEGER DEFAULT 0,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table email_templates créée');

    // Table email_preferences
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email_notifications BOOLEAN DEFAULT true,
        marketing_emails BOOLEAN DEFAULT true,
        reservation_confirmations BOOLEAN DEFAULT true,
        reservation_reminders BOOLEAN DEFAULT true,
        project_updates BOOLEAN DEFAULT true,
        project_status_changes BOOLEAN DEFAULT true,
        payment_notifications BOOLEAN DEFAULT true,
        newsletter BOOLEAN DEFAULT true,
        digest_frequency VARCHAR(50) DEFAULT 'immediate' CHECK (digest_frequency IN ('immediate', 'daily', 'weekly', 'never')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Table email_preferences créée');

    // Créer les index
    console.log('\n📊 Création des index...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
      CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type);
      CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
      CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key);
    `);
    console.log('✅ Index créés');

    // Insérer templates par défaut
    console.log('\n📧 Insertion des templates par défaut...');
    
    await pool.query(`
      INSERT INTO email_templates (template_key, name, description, subject, html_body, text_body, category, available_variables)
      VALUES 
      (
        'welcome',
        'Email de bienvenue',
        'Email envoyé lors de la création d''un compte',
        'Bienvenue sur LE SAGE DEV 🚀',
        '<p>Bonjour {{firstname}},</p><p>Bienvenue !</p>',
        'Bonjour {{firstname}}, Bienvenue !',
        'transactional',
        '["firstname", "lastname", "email"]'::jsonb
      ),
      (
        'reservation_created',
        'Réservation créée',
        'Confirmation de création de réservation',
        'Votre rendez-vous du {{reservation_date}} est enregistré',
        '<p>Bonjour {{firstname}},</p><p>Votre réservation a été créée.</p>',
        'Bonjour {{firstname}}, Votre réservation a été créée.',
        'transactional',
        '["firstname", "reservation_date", "reservation_time"]'::jsonb
      )
      ON CONFLICT (template_key) DO NOTHING;
    `);
    console.log('✅ Templates insérés');

    // Créer préférences email pour utilisateurs existants
    console.log('\n👥 Création préférences email pour utilisateurs existants...');
    
    await pool.query(`
      INSERT INTO email_preferences (user_id)
      SELECT id FROM users
      WHERE id NOT IN (SELECT user_id FROM email_preferences)
      ON CONFLICT (user_id) DO NOTHING;
    `);
    console.log('✅ Préférences créées');

    console.log('\n✅ Initialisation terminée avec succès !');
    console.log('\n📊 Statistiques :');
    
    const logsCount = await pool.query('SELECT COUNT(*) FROM email_logs');
    const templatesCount = await pool.query('SELECT COUNT(*) FROM email_templates');
    const prefsCount = await pool.query('SELECT COUNT(*) FROM email_preferences');
    
    console.log(`  - email_logs: ${logsCount.rows[0].count} entrées`);
    console.log(`  - email_templates: ${templatesCount.rows[0].count} templates`);
    console.log(`  - email_preferences: ${prefsCount.rows[0].count} utilisateurs`);
    
    console.log('\n🎯 Prochaines étapes :');
    console.log('  1. Configurer les variables EMAIL_* dans .env');
    console.log('  2. Tester l\'envoi avec: npm run test-email');
    console.log('  3. Intégrer les helpers dans vos routes\n');

  } catch (error) {
    console.error('\n❌ Erreur lors de l\'initialisation:', error);
    console.error('Message:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Exécuter le script
if (require.main === module) {
  initEmailTables();
}

module.exports = { initEmailTables };