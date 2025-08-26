const nodemailer = require('nodemailer');

// Configurazione trasportatore SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Invia email di verifica
const sendVerificationEmail = async (email, token, userType) => {
  // Usa la route corretta per la verifica email admin
  let verificationLink;
  if (userType === 'admin') {
    verificationLink = `${process.env.BASE_URL}/admin/auth/verify-email?token=${token}`;
  } else {
    verificationLink = `${process.env.BASE_URL}/auth/verify-email?token=${token}`;
  }

  const mailOptions = {
    from: `"Conferma Account" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Verifica il tuo account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verifica il tuo account</h2>
        <p>Clicca sul link seguente per verificare il tuo account:</p>
        <p><a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verifica Account</a></p>
        <p>Se non hai richiesto la verifica, ignora questa email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// Invia email di recupero password
const sendPasswordResetEmail = async (email, token, userType) => {
  let resetLink;
  if (userType === 'admin') {
    resetLink = `${process.env.BASE_URL}/admin/auth/reset-password?token=${token}`;
  } else {
    resetLink = `${process.env.BASE_URL}/auth/reset-password?token=${token}`;
  }

  const mailOptions = {
    from: `"Recupera password" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Recupero password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Recupero password</h2>
        <p>Hai richiesto il reset della password. Clicca sul link seguente per reimpostarla:</p>
        <p><a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reimposta Password</a></p>
        <p>Se non hai richiesto il reset, ignora questa email.</p>
        <p>Il link scadrà tra 1 ora.</p>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};