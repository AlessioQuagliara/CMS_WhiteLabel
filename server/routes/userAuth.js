const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();


// ================== RENDER PAGINE (GET) ==================

// Pagina registrazione user
router.get('/register', (req, res) => {
  res.render('user/auth/register', {
    title: 'Registrazione Utente',
    error: req.query.error,
    success: req.query.success,
    layout: 'layouts/main'
  });
});

// Pagina login user
router.get('/login', (req, res) => {
  res.render('user/auth/login', {
    title: 'Login Utente',
    error: req.query.error,
    layout: 'layouts/main'
  });
});

// Pagina forgot password user
router.get('/forgot-password', (req, res) => {
  res.render('user/auth/forgot-password', {
    title: 'Recupero Password',
    message: req.query.message,
    error: req.query.error,
    layout: 'layouts/main'
  });
});

// Pagina reset password user
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect('/auth/forgot-password?error=Token mancante');
  }
  res.render('user/auth/reset-password', {
    title: 'Reimposta Password',
    token: token,
    error: req.query.error,
    layout: 'layouts/main'
  });
});

// Pagina verifica email user
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.render('user/auth/verify-email', {
        title: 'Verifica Email',
        error: 'Token di verifica mancante',
        layout: 'layouts/main'
      });
    }
    const user = await User.findByVerificationToken(token);
    if (!user) {
      return res.render('user/auth/verify-email', {
        title: 'Verifica Email',
        error: 'Token di verifica non valido',
        layout: 'layouts/main'
      });
    }
    await User.verifyEmail(user.id);
    res.render('user/auth/verify-email', {
      title: 'Email Verificata',
      success: 'Email verificata con successo. Puoi ora accedere al tuo account.',
      layout: 'layouts/main'
    });
  } catch (error) {
    console.error('Errore verifica email user:', error);
    res.render('user/auth/verify-email', {
      title: 'Errore Verifica',
      error: 'Errore durante la verifica email',
      layout: 'layouts/main'
    });
  }
});

// ================== AZIONI (POST) ==================

// Registrazione user
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;
    if (!email || !password || !first_name || !last_name) {
      return res.redirect('/auth/register?error=Compila tutti i campi obbligatori');
    }
    if (password.length < 8) {
      return res.redirect('/auth/register?error=La password deve essere di almeno 8 caratteri');
    }
    const userExists = await User.findByEmail(email);
    if (userExists) {
      return res.redirect('/auth/register?error=Utente già registrato');
    }
    const newUser = await User.create({ email, password, first_name, last_name, phone });
    await sendVerificationEmail(email, newUser.verification_token, 'user');
    res.redirect('/auth/register?success=Registrazione completata. Verifica la tua email per attivare l\'account.');
  } catch (error) {
    console.error('Errore registrazione user:', error);
    res.redirect('/auth/register?error=Errore durante la registrazione');
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.redirect('/auth/login?error=Email e password sono obbligatorie');
    }
    const user = await User.findByEmail(email);
    if (!user) {
      return res.redirect('/auth/login?error=Credenziali non valide');
    }
    if (!user.verified) {
      return res.redirect('/auth/login?error=Email non verificata. Controlla la tua casella di posta.');
    }
    const validPassword = await User.verifyPassword(password, user.password);
    if (!validPassword) {
      return res.redirect('/auth/login?error=Credenziali non valide');
    }
    const token = jwt.sign(
      { userId: user.id, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.cookie('user_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });
    req.session.user_token = token;
    req.session.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name
    };
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Errore login user:', error);
    res.redirect('/auth/login?error=Errore durante il login');
  }
});

// Recupero password user
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.redirect('/auth/forgot-password?error=Email obbligatoria');
    }
    const user = await User.findByEmail(email);
    if (!user) {
      return res.redirect('/auth/forgot-password?message=Se l\'email esiste, è stata inviata una mail di recupero');
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await PasswordReset.createUserToken(user.id, resetToken, expiresAt);
    await sendPasswordResetEmail(email, resetToken, 'user');
    res.redirect('/auth/forgot-password?message=Se l\'email esiste, è stata inviata una mail di recupero');
  } catch (error) {
    console.error('Errore recupero password user:', error);
    res.redirect('/auth/forgot-password?error=Errore durante il recupero password');
  }
});

// Reset password user
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.redirect(`/auth/reset-password?token=${token}&error=Token e password sono obbligatori`);
    }
    if (password.length < 8) {
      return res.redirect(`/auth/reset-password?token=${token}&error=La password deve essere di almeno 8 caratteri`);
    }
    const resetRequest = await PasswordReset.findUserToken(token);
    if (!resetRequest) {
      return res.redirect('/auth/forgot-password?error=Token di reset non valido o scaduto');
    }
    await User.updatePassword(resetRequest.user_id, password);
    await PasswordReset.deleteUserToken(token);
    res.redirect('/auth/login?success=Password reimpostata con successo');
  } catch (error) {
    console.error('Errore reset password user:', error);
    res.redirect(`/auth/reset-password?token=${token}&error=Errore durante il reset della password`);
  }
});

// Logout user
router.get('/logout', (req, res) => {
  res.clearCookie('user_token');
  req.session.destroy((err) => {
    if (err) {
      console.error('Errore durante il logout:', err);
    }
    res.redirect('/auth/login');
  });
});

module.exports = router;