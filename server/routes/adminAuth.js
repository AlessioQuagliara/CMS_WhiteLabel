const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const PasswordReset = require('../models/PasswordReset');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

// 📝 RENDER delle pagine (GET)

// Pagina registrazione admin
router.get('/register', (req, res) => {
  res.render('admin/auth/register', {
    title: 'Registrazione Admin',
    error: req.query.error,
    success: req.query.success,
    layout: 'layouts/admin-auth' // Specifica il layout corretto
  });
});

// Pagina login admin  
router.get('/login', (req, res) => {
  res.render('admin/auth/login', {
    title: 'Login Admin',
    error: req.query.error,
    layout: 'layouts/admin-auth'
  });
});

// Pagina forgot password admin
router.get('/forgot-password', (req, res) => {
  res.render('admin/auth/forgot-password', {
    title: 'Recupero Password Admin',
    message: req.query.message,
    error: req.query.error,
    layout: 'layouts/admin-auth'
  });
});

// Pagina reset password admin
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.redirect('/admin/auth/forgot-password?error=Token mancante');
  }
  
  res.render('admin/auth/reset-password', {
    title: 'Reimposta Password Admin',
    token: token,
    error: req.query.error,
    layout: 'layouts/admin-auth'
  });
});

// Pagina verifica email admin
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.render('admin/auth/verify-email', {
        title: 'Verifica Email',
        error: 'Token di verifica mancante',
        layout: 'layouts/admin-auth'
      });
    }
    
    // Trova admin con il token di verifica
    const admin = await Admin.findByVerificationToken(token);
    if (!admin) {
      return res.render('admin/auth/verify-email', {
        title: 'Verifica Email',
        error: 'Token di verifica non valido',
        layout: 'layouts/admin-auth'
      });
    }
    
    // Aggiorna admin come verificato
    await Admin.verifyEmail(admin.id);
    
    res.render('admin/auth/verify-email', {
      title: 'Email Verificata',
      success: 'Email verificata con successo. Puoi ora accedere al tuo account.',
      layout: 'layouts/admin-auth'
    });
  } catch (error) {
    console.error('Errore verifica email admin:', error);
    res.render('admin/auth/verify-email', {
      title: 'Errore Verifica',
      error: 'Errore durante la verifica email',
      layout: 'layouts/admin-auth'
    });
  }
});

// 📝 AZIONI (POST)

// Registrazione admin
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, first_name, last_name } = req.body;
    // Validazione: richiedi email, password e almeno un nome
  if (!email || !password || (!name && (!first_name || !last_name))) {
      return res.redirect('/admin/auth/register?error=Compila tutti i campi obbligatori');
    }
    if (password.length < 8) {
      return res.redirect('/admin/auth/register?error=La password deve essere di almeno 8 caratteri');
    }
    // Verifica se l'admin esiste già
    const adminExists = await Admin.findByEmail(email);
    if (adminExists) {
      return res.redirect('/admin/auth/register?error=Admin già registrato');
    }
    // Creazione admin
  const newAdmin = await Admin.create({ email, password, name, first_name, last_name });
    // Invia email di verifica
    await sendVerificationEmail(email, newAdmin.verification_token, 'admin');
    res.redirect('/admin/auth/register?success=Registrazione completata. Verifica la tua email per attivare l\'account.');
  } catch (error) {
    console.error('Errore registrazione admin:', error);
    res.redirect('/admin/auth/register?error=Errore durante la registrazione admin');
  }
});

// Login admin
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    // Validazione
    if (!email || !password) {
      return res.redirect('/admin/auth/login?error=Email e password sono obbligatorie');
    }
    // Recupera admin
    const admin = await Admin.findByEmail(email);
    if (!admin) {
      return res.redirect('/admin/auth/login?error=Credenziali non valide');
    }
    // Verifica se l'email è stata verificata
    if (!admin.verified) {
      return res.redirect('/admin/auth/login?error=Email non verificata. Controlla la tua casella di posta.');
    }
    // Verifica password
    const validPassword = await Admin.verifyPassword(password, admin.password);
    if (!validPassword) {
      return res.redirect('/admin/auth/login?error=Credenziali non valide');
    }
    // Generazione token JWT
    const token = jwt.sign(
      { userId: admin.id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    // Imposta cookie e session
    res.cookie('admin_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 ore
    });
    req.session.admin_token = token; // Salva anche in session per compatibilità
    // Salva i dati dell'admin in sessione per la view
    req.session.admin_user = {
      id: admin.id,
      email: admin.email,
      name: admin.name || null
    };
    // Redirect alla dashboard admin
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Errore login admin:', error);
    res.redirect('/admin/auth/login?error=Errore durante il login admin');
  }
});

// Recupero password admin
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.redirect('/admin/auth/forgot-password?error=Email obbligatoria');
    }
    
    // Verifica se l'admin esiste
    const admin = await Admin.findByEmail(email);
    
    // Per motivi di sicurezza, mostriamo sempre lo stesso messaggio
    if (!admin) {
      return res.redirect('/admin/auth/forgot-password?message=Se l\'email esiste, è stata inviata una mail di recupero');
    }
    
    // Genera token di recupero
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
    
    // Salva token nel database
    await PasswordReset.createAdminToken(admin.id, resetToken, expiresAt);
    
    // Invia email di recupero
    await sendPasswordResetEmail(email, resetToken, 'admin');
    
    res.redirect('/admin/auth/forgot-password?message=Se l\'email esiste, è stata inviata una mail di recupero');
  } catch (error) {
    console.error('Errore recupero password admin:', error);
    res.redirect('/admin/auth/forgot-password?error=Errore durante il recupero password');
  }
});

// Reset password admin
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.redirect(`/admin/auth/reset-password?token=${token}&error=Token e password sono obbligatori`);
    }
    
    if (password.length < 8) {
      return res.redirect(`/admin/auth/reset-password?token=${token}&error=La password deve essere di almeno 8 caratteri`);
    }
    
    // Trova il token di reset
    const resetRequest = await PasswordReset.findAdminToken(token);
    if (!resetRequest) {
      return res.redirect('/admin/auth/forgot-password?error=Token di reset non valido o scaduto');
    }
    
    // Verifica se il token è scaduto
    if (resetRequest.expires_at < new Date()) {
      await PasswordReset.deleteAdminToken(token);
      return res.redirect('/admin/auth/forgot-password?error=Token di reset scaduto');
    }
    
    // Aggiorna password
    await Admin.updatePassword(resetRequest.admin_user_id, password);
    
    // Elimina il token di reset
    await PasswordReset.deleteAdminToken(token);
    
    res.redirect('/admin/auth/login?success=Password reimpostata con successo');
  } catch (error) {
    console.error('Errore reset password admin:', error);
    res.redirect(`/admin/auth/reset-password?token=${token}&error=Errore durante il reset della password`);
  }
});

// Logout admin
router.get('/logout', (req, res) => {
  res.clearCookie('admin_token');
  req.session.destroy((err) => {
    if (err) {
      console.error('Errore durante il logout:', err);
    }
    res.redirect('/admin/auth/login');
  });
});

module.exports = router;