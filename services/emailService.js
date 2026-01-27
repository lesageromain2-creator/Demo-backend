// backend/services/emailService.js
const nodemailer = require('nodemailer');
const { getPool } = require('../database/db');

// Resend (API HTTP) — utilisé sur Render car les ports SMTP sont bloqués
let Resend;
try {
  Resend = require('resend').Resend;
} catch (e) {
  Resend = null;
}

// ============================================
// CONFIGURATION
// ============================================

let transporter;
let emailProvider;
let resendClient;

/**
 * Créer le transporteur Nodemailer (SMTP). Non utilisé quand provider = resend.
 */
const createTransporter = () => {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('⚠️ SMTP_USER ou SMTP_PASS manquant — envoi SMTP désactivé');
    return null;
  }

  switch (provider) {
    case 'smtp':
      return nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      });
    case 'sendgrid':
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
      });
    case 'mailgun':
      return nodemailer.createTransport({
        host: 'smtp.mailgun.org',
        port: 587,
        auth: {
          user: process.env.MAILGUN_SMTP_LOGIN,
          pass: process.env.MAILGUN_SMTP_PASSWORD,
        },
      });
    default:
      return nodemailer.createTransport({
        host,
        port,
        auth: { user, pass },
      });
  }
};

const initEmailService = () => {
  if (transporter !== undefined && resendClient !== undefined) return;

  emailProvider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

  if (emailProvider === 'resend') {
    transporter = null;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ RESEND_API_KEY manquant — emails désactivés. Définissez-la sur Render.');
      resendClient = null;
    } else {
      resendClient = Resend ? new Resend(apiKey) : null;
      if (!resendClient) console.warn('⚠️ Package "resend" non installé. Lancez: npm install resend');
      else console.log('✅ Email Service (Resend API) initialisé — compatible Render');
    }
    return;
  }

  // SMTP
  transporter = createTransporter();
  resendClient = null;
  if (transporter) {
    console.log('✅ Email Service (SMTP) initialisé');
  } else {
    console.warn('⚠️ Email Service SMTP non configuré (SMTP_USER/SMTP_PASS manquants)');
  }
};

const isEmailConfigured = () => {
  if (emailProvider === 'resend') {
    return !!(process.env.RESEND_API_KEY && resendClient);
  }
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS && transporter);
};

// ============================================
// ENVOI VIA RESEND (API HTTP)
// ============================================

const sendViaResend = async (opts) => {
  if (!resendClient) throw new Error('Resend non configuré (RESEND_API_KEY manquant)');

  const from = opts.from?.address
    ? `${opts.from.name || 'LE SAGE DEV'} <${opts.from.address}>`
    : process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

  const payload = {
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text || undefined,
    reply_to: opts.replyTo || undefined,
  };

  const { data, error } = await resendClient.emails.send(payload);
  if (error) throw new Error(error.message || JSON.stringify(error));
  return { messageId: data?.id || 'resend-sent' };
};

// ============================================
// FONCTION PRINCIPALE : ENVOYER EMAIL
// ============================================

const sendEmail = async ({
  to,
  toName,
  subject,
  html,
  text,
  emailType,
  userId = null,
  context = {},
  variables = {},
  replyTo = null,
  attachments = [],
}) => {
  const pool = getPool();
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  if (!transporter && !resendClient) initEmailService();

  if (!isEmailConfigured()) {
    console.error('❌ Email non configuré. En production (Render), utilisez Resend: EMAIL_PROVIDER=resend + RESEND_API_KEY.');
    return { success: false, error: 'Email non configuré' };
  }

  if (process.env.EMAIL_PREVIEW_MODE === 'true') {
    console.log('📧 [PREVIEW] Non envoyé:', { to, subject, emailType });
    return { success: true, messageId: 'preview' };
  }

  const finalTo =
    process.env.NODE_ENV === 'development' && process.env.EMAIL_TEST_RECIPIENT
      ? process.env.EMAIL_TEST_RECIPIENT
      : to;

  const fromName = process.env.EMAIL_FROM_NAME || 'LE SAGE DEV';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const replyToVal = replyTo || process.env.EMAIL_REPLY_TO || fromAddress;

  const emailOptions = {
    from: { name: fromName, address: fromAddress },
    to: finalTo,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
    replyTo: replyToVal,
    attachments: attachments.length ? attachments : undefined,
  };

  let logId;
  try {
    const logResult = await pool.query(
      `INSERT INTO email_logs (
        recipient_email, recipient_name, user_id, email_type, subject,
        context, variables, status, provider
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        to,
        toName,
        userId,
        emailType,
        subject,
        JSON.stringify(context),
        JSON.stringify(variables),
        'pending',
        provider,
      ]
    );
    logId = logResult.rows[0].id;
  } catch (e) {
    console.error('❌ Erreur log email BDD:', e.message);
  }

  try {
    console.log(`📧 Envoi ${emailType} → ${to}`);

    let messageId;
    if (emailProvider === 'resend' && resendClient) {
      const res = await sendViaResend(emailOptions);
      messageId = res.messageId;
    } else if (transporter) {
      const info = await transporter.sendMail(emailOptions);
      messageId = info.messageId;
    } else {
      throw new Error('Aucun transport email configuré');
    }

    console.log('✅ Email envoyé:', messageId);

    if (logId) {
      await pool.query(
        `UPDATE email_logs SET status = 'sent', sent_at = CURRENT_TIMESTAMP, provider_message_id = $1 WHERE id = $2`,
        [messageId, logId]
      );
    }

    return { success: true, messageId, logId };
  } catch (error) {
    console.error('❌ Erreur envoi email:', error.message);
    if (provider === 'smtp' || !process.env.RESEND_API_KEY) {
      console.error('💡 Render bloque les ports SMTP. Utilisez Resend: EMAIL_PROVIDER=resend + RESEND_API_KEY sur Render.');
    }

    if (logId) {
      await pool.query(
        `UPDATE email_logs SET status = 'failed', error_message = $1 WHERE id = $2`,
        [error.message, logId]
      );
    }

    return { success: false, error: error.message, logId };
  }
};

// ============================================
// VÉRIFICATIONS
// ============================================

const checkUserEmailPreferences = async (userId, emailType) => {
  const pool = getPool();
  try {
    const result = await pool.query(
      `SELECT email_notifications, reservation_confirmations, reservation_reminders,
              project_updates, project_status_changes, payment_notifications, newsletter
       FROM email_preferences WHERE user_id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return true;

    const prefs = result.rows[0];
    if (!prefs.email_notifications) return false;

    const typeMapping = {
      reservation_created: 'reservation_confirmations',
      reservation_confirmed: 'reservation_confirmations',
      reservation_cancelled: 'reservation_confirmations',
      reservation_reminder: 'reservation_reminders',
      project_created: 'project_updates',
      project_updated: 'project_updates',
      project_status_changed: 'project_status_changes',
      project_delivered: 'project_updates',
      payment_success: 'payment_notifications',
      payment_failed: 'payment_notifications',
      newsletter: 'newsletter',
    };
    const key = typeMapping[emailType];
    if (key && prefs[key] !== undefined) return prefs[key];
    return true;
  } catch (e) {
    console.error('Erreur préférences email:', e.message);
    return true;
  }
};

const checkRateLimit = async () => {
  const pool = getPool();
  const limit = parseInt(process.env.EMAIL_RATE_LIMIT, 10) || 100;
  try {
    const r = await pool.query(
      `SELECT COUNT(*) as c FROM email_logs WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'`
    );
    const count = parseInt(r.rows[0].c, 10);
    if (count >= limit) {
      console.warn(`⚠️ Rate limit email: ${count}/${limit}`);
      return false;
    }
    return true;
  } catch (e) {
    return true;
  }
};

const getEmailStats = async (options = {}) => {
  const pool = getPool();
  const { startDate, endDate, emailType } = options;
  try {
    let q = `SELECT email_type, COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'sent') as sent,
             COUNT(*) FILTER (WHERE status = 'failed') as failed,
             COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
             COUNT(*) FILTER (WHERE status = 'opened') as opened,
             COUNT(*) FILTER (WHERE status = 'bounced') as bounced
             FROM email_logs WHERE 1=1`;
    const params = [];
    let n = 1;
    if (startDate) { q += ` AND created_at >= $${n}`; params.push(startDate); n++; }
    if (endDate) { q += ` AND created_at <= $${n}`; params.push(endDate); n++; }
    if (emailType) { q += ` AND email_type = $${n}`; params.push(emailType); n++; }
    q += ` GROUP BY email_type ORDER BY total DESC`;
    const result = await pool.query(q, params);
    return result.rows;
  } catch (e) {
    return [];
  }
};

const getUserEmailHistory = async (userId, limit = 50) => {
  const pool = getPool();
  try {
    const r = await pool.query(
      `SELECT id, email_type, subject, recipient_email, status, sent_at, opened_at, created_at
       FROM email_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return r.rows;
  } catch (e) {
    return [];
  }
};

module.exports = {
  initEmailService,
  sendEmail,
  isEmailConfigured,
  checkUserEmailPreferences,
  checkRateLimit,
  getEmailStats,
  getUserEmailHistory,
};
