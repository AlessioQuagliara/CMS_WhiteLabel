const express = require('express');
const { authenticateToken } = require('../middleware/userAuth');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Company = require('../models/Company');
const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');
const Message = require('../models/Message');

const router = express.Router();


// Dashboard user (EJS)
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const company = await Company.findByUserId(req.user.userId);
    const registrations = await EventRegistration.findByUserId(req.user.userId);
    // Calcola alcuni conteggi per la dashboard: eventi visibili, messaggi totali e non letti
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);

    // Messaggi che coinvolgono l'utente
    const msgCntRow = await knex('messages')
      .count('id as count')
      .where(function() {
        this.where('from_user_id', req.user.userId).orWhere('to_user_id', req.user.userId);
      })
      .first();
    const messagesCount = msgCntRow ? parseInt(msgCntRow.count, 10) : 0;

    // Messaggi non letti destinati all'utente
    const unreadRow = await knex('messages')
      .count('id as count')
      .where({ read: false })
      .andWhere(function() { this.where('to_user_id', req.user.userId); })
      .first();
    const unreadMessages = unreadRow ? parseInt(unreadRow.count, 10) : 0;

    // Eventi visibili per l'azienda (se presente)
    let eventsCount = 0;
    try {
      if (company && company.id) {
        const ev = await Event.findVisibleEvents(company.id, 1, 1);
        eventsCount = ev && ev.pagination ? ev.pagination.total : 0;
      }
    } catch (e) {
      console.warn('Errore conteggio eventi visibili per dashboard:', e);
    }

    res.render('user/dashboard', {
      title: 'Dashboard Utente',
      user,
      company,
      registrations,
      stats: {
        events: eventsCount,
        messages: messagesCount,
        unread_messages: unreadMessages,
        registrations: registrations ? registrations.length : 0
      },
  activePage: 'dashboard',
  layout: 'layouts/user-dashboard',
  showMessages: !!(company && Number(company.fatturato) > 1000000)
    });
  } catch (error) {
    console.error('Errore dashboard user:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero dei dati',
      activePage: 'dashboard',
      layout: 'layouts/user-dashboard'
    });
  }
});

// Messaggi utente (EJS)
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    // Recupera dati utente dal DB per nome/email, ma usa l'id dal token
    const dbUser = await User.findById(req.user.userId);
    const currentUserId = req.user.userId;
    const company = await Company.findByUserId(req.user.userId);
    const showMessages = !!(company && Number(company.fatturato) > 1000000);
    if (!showMessages) {
      // Non autorizzato ad accedere alla pagina messaggi
      if (req.accepts('html')) return res.status(403).render('error', { title: 'Accesso negato', error: 'Devi completare il profilo aziendale con fatturato superiore a 1.000.000€ per accedere ai messaggi', layout: 'layouts/user-dashboard' });
      return res.status(403).json({ error: 'forbidden', message: 'Accesso ai messaggi non consentito' });
    }
    // Mostra tutti i messaggi che coinvolgono questo utente (inviati o ricevuti).
    // Non facciamo affidamento su process.env.ADMIN_ID qui: potremmo avere più admin.
    const filters = {
      or: [
        { from_user_id: currentUserId },
        { to_user_id: currentUserId }
      ]
    };
    const result = await Message.search(filters, 1, 100);
    const messages = result.messages || [];
    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // choose an adminId to expose to the template (fallback to first admin if available)
    let exposedAdminId = process.env.ADMIN_ID || null;
    try {
      const admins = await Admin.findAll();
      if (admins && admins.length > 0) exposedAdminId = admins[0].id;
    } catch (e) {
      // ignore
    }

    res.render('user/messages', {
      title: 'I tuoi Messaggi',
      // Passa al template il token user (contiene userId) per la socket client
      user: req.user,
      activePage: 'messages',
      messages,
      adminId: exposedAdminId,
  layout: 'layouts/user-dashboard',
  showMessages
    });
  } catch (error) {
    console.error('Errore messaggi user:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero dei messaggi',
      activePage: 'messages',
      layout: 'layouts/user-dashboard'
    });
  }
});


// Invia messaggio (user → admin)
router.post('/messages/send', authenticateToken, async (req, res) => {
  try {
  let { toAdminId, message } = req.body;
    const currentUserId = req.user.userId;
    if (!currentUserId) {
      return res.status(401).json({ error: 'session_expired', message: 'Sessione utente scaduta' });
    }
    // Recupera alcuni dati dal DB per nome/email (opzionale)
    const dbUser = await User.findById(currentUserId);
    // Se il client non ha inviato a quale admin mandare (o ha inviato valore non valido),
    // scegli un admin di fallback (il primo trovato) per mantenere la persistenza corretta.
    if (!toAdminId) {
      try {
        const admins = await Admin.findAll();
        if (admins && admins.length > 0) {
          toAdminId = admins[0].id;
        }
      } catch (err) {
        console.warn('Nessun admin trovato per fallback toAdminId:', err);
        toAdminId = process.env.ADMIN_ID || '1';
      }
    }
    // Salva messaggio su DB (solo user→admin) - imposta l'id dal token (server-authoritative)
    const displayName = dbUser && (dbUser.first_name || dbUser.last_name) ? `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim() : (dbUser && dbUser.name ? dbUser.name : 'User');
    const msg = await Message.create({
      from_user_id: currentUserId,
      to_admin_id: toAdminId,
      name: displayName,
      email: dbUser ? dbUser.email : null,
      phone: dbUser ? dbUser.phone : null,
      message: message,
      ip: req.ip
    });
    // Notifica in tempo reale l'admin
    const io = req.app.get('io');
    if (io) {
        io.to(`admin_${toAdminId}`).emit('message:receive', {
        fromId: currentUserId,
        message: message,
        name: dbUser ? ((dbUser.first_name || dbUser.name) || dbUser.email) : 'User',
        email: dbUser ? dbUser.email : null,
        created_at: msg.created_at
      });
      try {
          const knexConfig = require('../../knexfile');
          const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
          const cnt = await knex('messages')
            .count('id as count')
            .where(function() {
              this.where('from_user_id', currentUserId).orWhere('to_user_id', currentUserId);
            })
            .first();
          const message_count = cnt ? parseInt(cnt.count, 10) : 0;
          const displayNameForUpdate = dbUser ? (dbUser.name || ((dbUser.first_name || '') + ' ' + (dbUser.last_name || '')).trim() || dbUser.email) : 'User';
          io.to(`admin_${toAdminId}`).emit('admin:users:update', {
            userId: currentUserId,
            message_count,
            name: displayNameForUpdate
          });
      } catch (err) {
        console.warn('Errore calcolo message_count dopo invio user->admin:', err);
      }
    }
    res.status(201).json({ message: 'Messaggio inviato', data: msg });
  } catch (error) {
    console.error('Errore invio messaggio:', error);
    res.status(500).json({ error: 'Errore durante l\'invio del messaggio' });
  }
});

// Recupera conversazione 1:1 con admin (tutti i messaggi user-admin)
router.get('/messages/conversation/:adminId', authenticateToken, async (req, res) => {
  try {
    let { adminId } = req.params;
    const currentUserId = req.user.userId;
    // Recupera solo i messaggi tra questo utente e questo admin
    // normalizza il tipo
    adminId = parseInt(adminId, 10);
    const filters = {
      or: [
        { from_user_id: currentUserId, to_admin_id: adminId },
        { from_admin_id: adminId, to_user_id: currentUserId }
      ]
    };
    const result = await Message.search(filters, 1, 100);
    res.json({ messages: result.messages });
  } catch (error) {
    console.error('Errore recupero conversazione:', error);
    res.status(500).json({ error: 'Errore durante il recupero della conversazione' });
  }
});

// Eventi utente (EJS)
router.get('/events', authenticateToken, async (req, res) => {
  try {
    // Recupera eventi disponibili per l'utente (da implementare in Event.js)
    const events = await Event.findAll ? await Event.findAll() : [];
    res.render('user/events', {
      title: 'Eventi',
      user: req.user,
      activePage: 'events',
      events,
      layout: 'layouts/user-dashboard'
    });
  } catch (error) {
    console.error('Errore eventi user:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero degli eventi',
      activePage: 'events',
      layout: 'layouts/user-dashboard'
    });
  }
});

// Pagina account (modifica profilo)
router.get('/account', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const company = await Company.findByUserId(req.user.userId);
    return res.render('user/account', {
      title: 'Account',
      user: user || req.user,
      activePage: 'account',
      layout: 'layouts/user-dashboard',
      showMessages: !!(company && Number(company.fatturato) > 1000000)
    });
  } catch (err) {
    console.error('Errore pagina account:', err);
    return res.status(500).render('error', { title: 'Errore', error: 'Errore durante il recupero del profilo', layout: 'layouts/user-dashboard' });
  }
});

// Aggiorna profilo utente
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;

    // Controllo email unica se l'utente tenta di modificarla
    if (email) {
      const existing = await User.findByEmail(email);
      if (existing && existing.id !== req.user.userId) {
        const msg = 'Questa email è già in uso da un altro account.';
        if (req.accepts('html')) {
          const user = await User.findById(req.user.userId);
          return res.status(409).render('user/account', { title: 'Account', user: Object.assign({}, user, { email }), error: msg, activePage: 'account', layout: 'layouts/user-dashboard' });
        }
        return res.status(409).json({ error: 'unique_violation', message: msg });
      }
    }

    // Aggiorna i campi consentiti (non tocchiamo verified/verification_token qui)
    const updatePayload = {};
    if (typeof first_name !== 'undefined') updatePayload.first_name = first_name;
    if (typeof last_name !== 'undefined') updatePayload.last_name = last_name;
    if (typeof email !== 'undefined') updatePayload.email = email;
    if (typeof phone !== 'undefined') updatePayload.phone = phone;

    let updatedUser = null;
    if (Object.keys(updatePayload).length > 0) {
      updatedUser = await User.updateProfile(req.user.userId, updatePayload);
    }

    // Se arriva una nuova password, la trattiamo separatamente
    if (password) {
      if (typeof password !== 'string' || password.length < 8) {
        const msg = 'La password deve essere di almeno 8 caratteri.';
        if (req.accepts('html')) {
          const user = await User.findById(req.user.userId);
          return res.status(400).render('user/account', { title: 'Account', user: Object.assign({}, user, updatePayload), error: msg, activePage: 'account', layout: 'layouts/user-dashboard' });
        }
        return res.status(400).json({ error: 'validation', message: msg });
      }
      await User.updatePassword(req.user.userId, password);
    }

    if (req.accepts('html')) {
      // Redirect alla pagina account con messaggio di successo
      return res.json({ message: 'Profilo aggiornato con successo', user: updatedUser });
    }
    return res.json({ message: 'Profilo aggiornato con successo', user: updatedUser });
  } catch (error) {
    console.error('Errore aggiornamento profilo:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento del profilo' });
  }
});

// Gestione azienda
// Pagina modifica/creazione azienda (EJS) o API JSON
router.get('/company', authenticateToken, async (req, res) => {
  try {
    const company = await Company.findByUserId(req.user.userId);
    if (req.accepts('html')) {
      return res.render('user/company', {
        title: 'La tua Azienda',
        user: req.user,
        company,
  activePage: 'company',
  layout: 'layouts/user-dashboard',
  showMessages: !!(company && Number(company.fatturato) > 1000000)
      });
    }
    return res.json({ company });
  } catch (error) {
    console.error('Errore recupero azienda:', error);
    if (req.accepts('html')) {
      return res.status(500).render('error', { title: 'Errore', error: 'Errore durante il recupero dei dati azienda', layout: 'layouts/user-dashboard' });
    }
    return res.status(500).json({ error: 'Errore durante il recupero dei dati azienda' });
  }
});

// Crea o aggiorna azienda
router.post('/company', authenticateToken, async (req, res) => {
  try {
    // Prendi solo i campi consentiti dalla request e normalizza
    const allowed = ['ragione_sociale','campo_attivita','piva','codice_fiscale','fatturato','pec','sdi','indirizzo','citta','cap','provincia','nazione','telefono','sito_web'];
    const raw = req.body || {};
    const companyData = {};
    allowed.forEach(k => {
      if (typeof raw[k] !== 'undefined') {
        companyData[k] = (typeof raw[k] === 'string') ? raw[k].trim() : raw[k];
      }
    });

    // Normalizzazioni utili
    if (companyData.provincia) companyData.provincia = companyData.provincia.toUpperCase();
    if (!companyData.nazione) companyData.nazione = 'Italia';
    if (companyData.piva) companyData.piva = companyData.piva.replace(/\s+/g, '');
    if (companyData.fatturato) {
      const f = parseFloat(companyData.fatturato);
      companyData.fatturato = Number.isFinite(f) ? f.toFixed(2) : null;
    }

    // Validazione minima server-side per campi NOT NULL nella tabella
    const missing = [];
  ['ragione_sociale','campo_attivita','piva','pec','sdi','indirizzo','citta','cap','provincia','fatturato'].forEach(field => {
      if (!companyData[field]) missing.push(field);
    });
    if (missing.length > 0) {
      const errMsg = `Campi obbligatori mancanti: ${missing.join(', ')}`;
      if (req.accepts('html')) {
        const company = await Company.findByUserId(req.user.userId);
        return res.status(400).render('user/company', { title: 'La tua Azienda', user: req.user, company: Object.assign({}, company || {}, companyData), error: errMsg, activePage: 'company', layout: 'layouts/user-dashboard' });
      }
      return res.status(400).json({ error: 'validation', message: errMsg });
    }

    // Salva/aggiorna azienda tramite helper del modello User
    let company;
    try {
      company = await User.upsertCompany(req.user.userId, companyData);
    } catch (err) {
      // Gestione comune di errori DB (es. vincoli UNIQUE su piva/pec)
      if (err && err.code === '23505') { // unique_violation
        const detail = err.detail || '';
        let field = 'campo_unico';
        if (/piva/i.test(detail)) field = 'piva';
        else if (/pec/i.test(detail)) field = 'pec';
        const msg = `Valore duplicato per ${field}. Verifica il campo e riprova.`;
        if (req.accepts('html')) {
          const existing = await Company.findByUserId(req.user.userId);
          return res.status(400).render('user/company', { title: 'La tua Azienda', user: req.user, company: Object.assign({}, existing || {}, companyData), error: msg, activePage: 'company', layout: 'layouts/user-dashboard' });
        }
        return res.status(409).json({ error: 'unique_violation', message: msg });
      }
      throw err;
    }

    if (req.accepts('html')) {
      // Redirect to dashboard after successful update
      return res.redirect('/dashboard');
    }
    return res.json({
      message: company && company.id ? 'Azienda aggiornata con successo' : 'Azienda creata con successo',
      company
    });
  } catch (error) {
    console.error('Errore gestione azienda:', error);
    if (req.accepts('html')) {
      return res.status(500).render('error', { title: 'Errore', error: 'Errore durante la gestione dell\'azienda', layout: 'layouts/user-dashboard' });
    }
    return res.status(500).json({ error: 'Errore durante la gestione dell\'azienda' });
  }
});

// Eventi disponibili per l'utente
router.get('/events/available', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const company = await Company.findByUserId(req.user.userId);
    
    if (!company) {
      return res.status(400).json({ error: 'Devi prima completare il profilo aziendale' });
    }
    
    const result = await Event.findVisibleEvents(company.id, page, limit);
    
    res.json({
      events: result.events,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Errore recupero eventi:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli eventi' });
  }
});

// Registrazione a evento
router.post('/events/:eventId/register', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { notes } = req.body;
    
    const company = await Company.findByUserId(req.user.userId);
    if (!company) {
      return res.status(400).json({ error: 'Devi prima completare il profilo aziendale' });
    }
    
    // Verifica se l'utente è già registrato
    const existingRegistration = await EventRegistration.isUserRegistered(eventId, req.user.userId);
    if (existingRegistration) {
      return res.status(400).json({ error: 'Sei già registrato a questo evento' });
    }
    
    // Crea la registrazione
    const registration = await EventRegistration.create({
      event_id: eventId,
      user_id: req.user.userId,
      company_id: company.id,
      notes
    });
    
    res.status(201).json({
      message: 'Registrazione all\'evento effettuata con successo',
      registration
    });
  } catch (error) {
    console.error('Errore registrazione evento:', error);
    res.status(500).json({ error: 'Errore durante la registrazione all\'evento' });
  }
});

module.exports = router;