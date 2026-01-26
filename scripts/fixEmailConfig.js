// Script pour corriger la configuration email
const fs = require('fs');
const path = require('path');

console.log('🔧 Correction de la configuration email...');

const envPath = path.join(__dirname, '../.env');
let envContent = fs.readFileSync(envPath, 'utf8');

// Remplacer la ligne EMAIL_TEST_RECIPIENT
const oldLine = 'EMAIL_TEST_RECIPIENT=lesage.pro.dev@gmail.com';
const newLine = '# EMAIL_TEST_RECIPIENT=lesage.pro.dev@gmail.com # Désactivé pour envoyer aux vrais clients';

if (envContent.includes(oldLine)) {
  envContent = envContent.replace(oldLine, newLine);
  fs.writeFileSync(envPath, envContent);
  console.log('✅ EMAIL_TEST_RECIPIENT désactivé');
} else {
  console.log('ℹ️ EMAIL_TEST_RECIPIENT déjà désactivé ou non trouvé');
}

// Vérifier la configuration SMTP
const smtpConfig = {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS
};

console.log('\n📋 Configuration SMTP actuelle:');
Object.entries(smtpConfig).forEach(([key, value]) => {
  if (key.includes('PASS')) {
    console.log(`  ${key}: ***`);
  } else {
    console.log(`  ${key}: ${value}`);
  }
});

console.log('\n✅ Configuration corrigée !');
console.log('📧 Les emails seront maintenant envoyés aux vrais destinataires');
