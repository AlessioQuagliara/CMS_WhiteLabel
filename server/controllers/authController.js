const User = require('../models/User');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const Message = require('../models/Message');
const Visit = require('../models/Visit');
const PasswordReset = require('../models/PasswordReset');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Registrazione admin
exports.registerAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Validazione
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatorie' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'La password deve essere di almeno 8 caratteri' });
    }
    
    // Verifica se l'admin esiste già
    const adminExists = await Admin.findByEmail(email);
    
    if (adminExists) {
      return res.status(400).json({ error: 'Admin già registrato' });
    }
    
    // Crea admin
    const newAdmin = await Admin.create({ email, password, name });
    
    // Invia email di verifica
    await sendVerificationEmail(email, newAdmin.verification_token, 'admin');
    
    res.status(201).json({
      message: 'Registrazione admin completata. Verifica la tua email per attivare l\'account.',
      admin: { id: newAdmin.id, email: newAdmin.email, name: newAdmin.name }
    });
  } catch (error) {
    console.error('Errore registrazione admin:', error);
    res.status(500).json({ error: 'Errore durante la registrazione admin' });
  }
};

// Verifica email admin
exports.verifyAdminEmail = async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Token di verifica mancante' });
    }
    
    // Trova admin con il token di verifica
    const admin = await Admin.findByVerificationToken(token);
    
    if (!admin) {
      return res.status(400).json({ error: 'Token di verifica non valido' });
    }
    
    // Aggiorna admin come verificato
    await Admin.verifyEmail(admin.id);
    
    res.json({ message: 'Email admin verificata con successo. Puoi ora accedere al tuo account.' });
  } catch (error) {
    console.error('Errore verifica email admin:', error);
    res.status(500).json({ error: 'Errore durante la verifica email admin' });
  }
};

// Login admin
exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validazione
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password sono obbligatorie' });
    }
    
    // Recupera admin
    const admin = await Admin.findByEmail(email);
    
    if (!admin) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    // Verifica se l'email è stata verificata
    if (!admin.verified) {
      return res.status(401).json({ error: 'Email non verificata. Controlla la tua casella di posta.' });
    }
    
    // Verifica password
    const validPassword = await Admin.verifyPassword(password, admin.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    // Generazione token JWT
    const token = jwt.sign(
      { userId: admin.id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login admin effettuato con successo',
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: 'admin' }
    });
  } catch (error) {
    console.error('Errore login admin:', error);
    res.status(500).json({ error: 'Errore durante il login admin' });
  }
};

// Recupero password admin
exports.forgotAdminPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email obbligatoria' });
    }
    
    // Verifica se l'admin esiste
    const admin = await Admin.findByEmail(email);
    
    if (!admin) {
      // Per motivi di sicurezza, non rivelare se l'email esiste o meno
      return res.json({ message: 'Se l\'email esiste, è stata inviata una mail di recupero' });
    }
    
    // Genera token di recupero
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
    
    // Salva token nel database
    await PasswordReset.createAdminToken(admin.id, resetToken, expiresAt);
    
    // Invia email di recupero
    await sendPasswordResetEmail(email, resetToken, 'admin');
    
    res.json({ message: 'Se l\'email esiste, è stata inviata una mail di recupero' });
  } catch (error) {
    console.error('Errore recupero password admin:', error);
    res.status(500).json({ error: 'Errore durante il recupero password admin' });
  }
};

// Reset password admin
exports.resetAdminPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token e password sono obbligatori' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'La password deve essere di almeno 8 caratteri' });
    }
    
    // Trova il token di reset
    const resetRequest = await PasswordReset.findAdminToken(token);
    
    if (!resetRequest) {
      return res.status(400).json({ error: 'Token di reset non valido o scaduto' });
    }
    
    // Aggiorna password
    await Admin.updatePassword(resetRequest.admin_user_id, password);
    
    // Elimina il token di reset
    await PasswordReset.deleteAdminToken(token);
    
    res.json({ message: 'Password admin reimpostata con successo' });
  } catch (error) {
    console.error('Errore reset password admin:', error);
    res.status(500).json({ error: 'Errore durante il reset della password admin' });
  }
};

// Ottieni tutti gli utenti
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const users = await User.findAll(parseInt(page), parseInt(limit));
    
    res.json(users);
  } catch (error) {
    console.error('Errore recupero utenti:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli utenti' });
  }
};

// Ottieni utente specifico
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Errore recupero utente:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'utente' });
  }
};

// Elimina utente
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedUser = await User.delete(id);
    
    if (!deletedUser) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    res.json({ message: 'Utente eliminato con successo' });
  } catch (error) {
    console.error('Errore eliminazione utente:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'utente' });
  }
};

// Ottieni tutte le aziende
exports.getAllCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const companies = await Company.findAll(parseInt(page), parseInt(limit));
    
    res.json(companies);
  } catch (error) {
    console.error('Errore recupero aziende:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle aziende' });
  }
};

// Ottieni statistiche del sito
exports.getSiteStats = async (req, res) => {
  try {
    const userCount = await User.count();
    const companyCount = await Company.count();
    const messageCount = await Message.count();
    const unreadMessages = await Message.countUnread();
    
    // Ottieni statistiche visite degli ultimi 7 giorni
    const visitStats = await Visit.getUniqueVisitors(7);
    
    res.json({
      users: userCount,
      companies: companyCount,
      messages: messageCount,
      unread_messages: unreadMessages,
      visits: visitStats
    });
  } catch (error) {
    console.error('Errore recupero statistiche:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle statistiche' });
  }
};

// Ottieni tutti i messaggi
exports.getAllMessages = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const messages = await Message.findAll(parseInt(page), parseInt(limit));
    
    res.json(messages);
  } catch (error) {
    console.error('Errore recupero messaggi:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei messaggi' });
  }
};

// Marca messaggio come letto
exports.markMessageAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await Message.markAsRead(id);
    
    if (!message) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    
    res.json({ message: 'Messaggio segnato come letto', message });
  } catch (error) {
    console.error('Errore aggiornamento messaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del messaggio' });
  }
};

// Elimina messaggio
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedMessage = await Message.delete(id);
    
    if (!deletedMessage) {
      return res.status(404).json({ error: 'Messaggio non trovato' });
    }
    
    res.json({ message: 'Messaggio eliminato con successo' });
  } catch (error) {
    console.error('Errore eliminazione messaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del messaggio' });
  }
};