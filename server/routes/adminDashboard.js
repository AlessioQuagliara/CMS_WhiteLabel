const express = require('express');
const { authenticateAdmin } = require('../middleware/adminAuth');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Visit = require('../models/Visit')
const Message = require('../models/Message');
const Event = require('../models/Event');
 
const router = express.Router();


// Dashboard admin (EJS)
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Recupera statistiche dal database
    const usersCount = await User.count();
    const adminsCount = await Admin.count();
    const messagesCount = await Message.count();
    const unreadMessagesCount = await Message.countUnread();

    // Conteggio visite (views)
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const viewsCountResult = await knex('visits').count('id as count');
    const viewsCount = viewsCountResult && viewsCountResult[0] ? parseInt(viewsCountResult[0].count, 10) : 0;

    // Prendi i dati dell'admin dalla sessione se disponibili
    const user = req.session && req.session.admin_user ? req.session.admin_user : req.user;

    res.render('admin/dashboard', {
      title: 'Dashboard Admin',
      user,
      stats: {
        users: usersCount,
        admins: adminsCount,
        messages: messagesCount,
        unread_messages: unreadMessagesCount,
        views: viewsCount,
        revenue: 12500
      },
      activePage: 'dashboard',
      layout: 'layouts/admin-dashboard'
    });
  } catch (error) {
    console.error('Errore dashboard admin:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero dei dati'
    });
  }
});

// Admin account page (GET) and update (PUT)
router.get('/account', authenticateAdmin, async (req, res) => {
  try {
    const admin = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    const adminData = await Admin.findById(admin.id || admin.adminId || admin.userId);
    return res.render('admin/account', {
      title: 'Account Admin',
      user: adminData || admin,
      activePage: 'account',
      layout: 'layouts/admin-dashboard'
    });
  } catch (err) {
    console.error('Errore GET account admin:', err);
    return res.status(500).render('error', { title: 'Errore', error: 'Errore durante il recupero dei dati admin' });
  }
});

router.put('/account', authenticateAdmin, async (req, res) => {
  try {
    const adminSession = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    const adminId = adminSession.id || adminSession.adminId || adminSession.userId;
    const { email, name, first_name, last_name, password } = req.body;

    // Check unique email
    if (email) {
      const existing = await Admin.findByEmail(email);
      if (existing && existing.id !== adminId) {
        const msg = 'Questa email è già in uso da un altro amministratore.';
        if (req.accepts('html')) {
          const adminData = await Admin.findById(adminId);
          return res.status(409).render('admin/account', { title: 'Account Admin', user: Object.assign({}, adminData, { email }), error: msg, activePage: 'account', layout: 'layouts/admin-dashboard' });
        }
        return res.status(409).json({ error: 'unique_violation', message: msg });
      }
    }

    // Update fields
    const updates = {};
    if (typeof name !== 'undefined') updates.name = name;
    if (typeof first_name !== 'undefined') updates.first_name = first_name;
    if (typeof last_name !== 'undefined') updates.last_name = last_name;
    if (typeof email !== 'undefined') updates.email = email;

    let updated = null;
    if (Object.keys(updates).length > 0) {
      updated = await Admin.update(adminId, updates);
    }

    if (password) {
      // richiedi password corrente per maggiore sicurezza
      const currentPassword = req.body.current_password;
      if (!currentPassword) {
        const msg = 'Password corrente richiesta per cambiare password.';
        if (req.accepts('html')) {
          const adminData = await Admin.findById(adminId);
          return res.status(400).render('admin/account', { title: 'Account Admin', user: Object.assign({}, adminData, updates), error: msg, activePage: 'account', layout: 'layouts/admin-dashboard' });
        }
        return res.status(400).json({ error: 'validation', message: msg });
      }

      // Verifica la password corrente confrontandola con l'hash in DB
      const rawAdmin = await require('../models/Admin').findById(adminId);
      const dbFull = await require('../config/database')('admin_users').where({ id: adminId }).first();
      if (!dbFull) {
        const msg = 'Admin non trovato.';
        if (req.accepts('html')) return res.status(404).render('error', { title: 'Errore', error: msg });
        return res.status(404).json({ error: 'not_found', message: msg });
      }
      const bcrypt = require('bcrypt');
      const match = await bcrypt.compare(currentPassword, dbFull.password);
      if (!match) {
        const msg = 'Password corrente non corretta.';
        if (req.accepts('html')) {
          const adminData = await Admin.findById(adminId);
          return res.status(401).render('admin/account', { title: 'Account Admin', user: Object.assign({}, adminData, updates), error: msg, activePage: 'account', layout: 'layouts/admin-dashboard' });
        }
        return res.status(401).json({ error: 'invalid_password', message: msg });
      }

      if (typeof password !== 'string' || password.length < 8) {
        const msg = 'La password deve essere di almeno 8 caratteri.';
        if (req.accepts('html')) {
          const adminData = await Admin.findById(adminId);
          return res.status(400).render('admin/account', { title: 'Account Admin', user: Object.assign({}, adminData, updates), error: msg, activePage: 'account', layout: 'layouts/admin-dashboard' });
        }
        return res.status(400).json({ error: 'validation', message: msg });
      }
      await Admin.updatePassword(adminId, password);
    }

    // Sincronizza sessione admin_user se presente
    try {
      if (req.session && req.session.admin_user) {
        const refreshed = await Admin.findById(adminId);
        req.session.admin_user = Object.assign({}, req.session.admin_user, refreshed);
      }
    } catch (sessErr) {
      console.warn('Impossibile sincronizzare session admin_user:', sessErr);
    }

    if (req.accepts('html')) {
      const adminData = await Admin.findById(adminId);
      return res.render('admin/account', { title: 'Account Admin', user: adminData, success: 'Dati aggiornati con successo', activePage: 'account', layout: 'layouts/admin-dashboard' });
    }

    return res.json({ message: 'Admin aggiornato', admin: updated });
  } catch (err) {
    console.error('Errore PUT account admin:', err);
    if (req.accepts('html')) return res.status(500).render('admin/account', { title: 'Account Admin', user: req.user, error: 'Errore durante l\'aggiornamento' });
    return res.status(500).json({ error: 'Errore durante l\'aggiornamento' });
  }
});

// Lista utenti
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    // Prendi i dati dell'admin dalla sessione se disponibili
    const user = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    // Supporta paginazione con query params
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    // Recupera elenco utenti con company (left join) e supporto ricerca
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();

    // base select query
    let selectQuery = knex('users as u')
      .select('u.id', 'u.email', knex.raw("COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), u.email) as name"), 'u.created_at', 'c.ragione_sociale as company')
      .leftJoin('companies as c', 'c.user_id', 'u.id');

    // base count query
    let countQuery = knex('users as u').count('* as total');

    if (q) {
      const ilike = `%${q}%`;
      selectQuery = selectQuery.where(function() {
        this.where('u.email', 'ilike', ilike)
          .orWhereRaw("COALESCE(u.first_name || ' ' || u.last_name, u.email) ILIKE ?", [ilike])
          .orWhere('c.ragione_sociale', 'ilike', ilike);
      });
      countQuery = countQuery.where(function() {
        this.where('u.email', 'ilike', ilike)
          .orWhereRaw("COALESCE(u.first_name || ' ' || u.last_name, u.email) ILIKE ?", [ilike])
          .orWhere('c.ragione_sociale', 'ilike', ilike);
      }).leftJoin('companies as c', 'c.user_id', 'u.id');
    } else {
      // ensure same join for count when no filter
      countQuery = countQuery.leftJoin('companies as c', 'c.user_id', 'u.id');
    }

    const users = await selectQuery.orderBy('u.created_at', 'desc').offset(offset).limit(limit);
    const totalRow = await countQuery.first();
    const totalUsers = totalRow ? parseInt(totalRow.total, 10) : 0;
    const pagination = { page, limit, total: totalUsers, pages: Math.max(1, Math.ceil(totalUsers / limit)) };
    res.render('admin/users', {
      title: 'Gestione Utenti',
      user,
      users,
  pagination,
      q,
      activePage: 'users',
      layout: 'layouts/admin-dashboard'
    });
  } catch (error) {
    console.error('Errore utenti admin:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero degli utenti'
    });
  }
});

// Lista messaggi
router.get('/messages', authenticateAdmin, async (req, res) => {
  // Prendi i dati dell'admin dalla sessione se disponibili
  const user = req.session && req.session.admin_user ? req.session.admin_user : req.user;
  try {
    // Supporto ricerca + paginazione per lista utenti con conteggio messaggi
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const q = (req.query.q || '').trim();

    // Mostra solo i messaggi tra admin e utenti (sia inviati che ricevuti)
    const filters = {
      or: [
        { from_admin_id: user.adminId }, // admin → user
        { to_admin_id: user.adminId }     // user → admin
      ]
    };
    const result = await Message.search(filters, 1, 100);
    const messages = result.messages;

    // Inoltre recupera tutti gli utenti con il conteggio dei messaggi (in/out)
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const offset = (page - 1) * limit;

    // base queries
    let selectQuery = knex('users as u')
      .select('u.id', 'u.first_name', 'u.last_name', 'u.email')
      .countDistinct('m.id as message_count')
      .leftJoin('messages as m', function() {
        this.on('m.from_user_id', '=', 'u.id').orOn('m.to_user_id', '=', 'u.id');
      })
      .groupBy('u.id')
      .orderBy('u.created_at', 'desc');

    let countQuery = knex('users as u');
    if (q) {
      const ilike = `%${q}%`;
      selectQuery = selectQuery.where(function() {
        this.where('u.email', 'ilike', ilike)
          .orWhereRaw("COALESCE(u.first_name || ' ' || u.last_name, u.email) ILIKE ?", [ilike]);
      });
      countQuery = countQuery.where(function() {
        this.where('u.email', 'ilike', ilike)
          .orWhereRaw("COALESCE(u.first_name || ' ' || u.last_name, u.email) ILIKE ?", [ilike]);
      });
    }

    const usersWithCounts = await selectQuery.offset(offset).limit(limit);
    // total users matching filter
    const totalRow = await countQuery.countDistinct('u.id as total').first();
    const totalUsers = totalRow ? parseInt(totalRow.total, 10) : 0;
    const pagination = { page, limit, total: totalUsers, pages: Math.max(1, Math.ceil(totalUsers / limit)) };

    res.render('admin/messages', {
      title: 'Gestione Messaggi',
      user,
      messages,
      usersWithCounts,
      pagination,
      q,
      activePage: 'messages',
      layout: 'layouts/admin-dashboard'
    });
  } catch (error) {
    console.error('Errore messaggi admin:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero dei messaggi'
    });
  }
});

// Visualizza dettagli utente (readonly)
router.get('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const user = await knex('users as u')
      .select('u.id', 'u.email', 'u.first_name', 'u.last_name', 'u.phone', 'u.created_at', 'c.*')
      .leftJoin('companies as c', 'c.user_id', 'u.id')
      .where('u.id', id)
      .first();
    if (!user) return res.status(404).render('error', { title: 'Non trovato', error: 'Utente non trovato' });
    res.render('admin/user-detail', { title: 'Dettaglio Utente', user, activePage: 'users', layout: 'layouts/admin-dashboard' });
  } catch (err) {
    console.error('Errore recupero dettaglio utente:', err);
    return res.status(500).render('error', { title: 'Errore', error: 'Errore durante il recupero dell\'utente' });
  }
});

// Cancella utente (API)
router.delete('/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    // trova company associata (se presente)
    const company = await knex('companies').where({ user_id: id }).first();
    const companyId = company ? company.id : null;

    // elimina registrazioni eventi legate all'utente o alla company
    try {
      await knex('event_registrations').where(function() {
        this.where('user_id', id);
        if (companyId) this.orWhere('company_id', companyId);
      }).del();
    } catch (e) {
      console.warn('Errore cancellazione event_registrations per utente', id, e && e.message);
    }

    // elimina messaggi inviati/ricevuti dall'utente
    try {
      await knex('messages').where(function() {
        this.where('from_user_id', id).orWhere('to_user_id', id);
      }).del();
    } catch (e) {
      console.warn('Errore cancellazione messages per utente', id, e && e.message);
    }

    // elimina company associata e poi l'utente
    try {
      await knex('companies').where({ user_id: id }).del();
    } catch (e) {
      console.warn('Errore cancellazione company per utente', id, e && e.message);
    }

    const deleted = await knex('users').where({ id }).del().returning('id');
    if (!deleted || deleted.length === 0) return res.status(404).json({ error: 'not_found' });

    // elimina token di password reset per l'utente
    try {
      await knex('password_resets').where({ user_id: id }).del();
    } catch (e) {
      console.warn('Errore cancellazione password_resets per utente', id, e && e.message);
    }

    // elimina visite (visit logs) legate all'utente
    try {
      await knex('visits').where(function() { this.where('user_id', id).orWhere('ip', req.ip); }).del();
    } catch (e) {
      console.warn('Errore cancellazione visits per utente', id, e && e.message);
    }

    // imposta flash in sessione per messaggio lato client
    if (req.session) req.session.flash = { success: encodeURIComponent('Utente eliminato') };

    if (req.accepts('html')) return res.redirect('/admin/users');
    return res.json({ message: 'Utente eliminato' });
  } catch (err) {
    console.error('Errore cancellazione utente:', err);
    return res.status(500).json({ error: 'Errore cancellazione utente' });
  }
});

// Endpoint JSON per polling admin: lista utenti + conteggi messaggi
router.get('/messages/summary', authenticateAdmin, async (req, res) => {
  try {
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const usersWithCounts = await knex('users as u')
      .select('u.id', 'u.first_name', 'u.last_name', 'u.email')
      .countDistinct('m.id as message_count')
      .leftJoin('messages as m', function() {
        this.on('m.from_user_id', '=', 'u.id').orOn('m.to_user_id', '=', 'u.id');
      })
      .groupBy('u.id')
      .orderBy('u.created_at', 'desc');

    res.json({ users: usersWithCounts });
  } catch (err) {
    console.error('Errore summary admin:', err);
    res.status(500).json({ error: 'Errore recupero summary' });
  }
});


// Invia messaggio (admin → user)
router.post('/messages/send', authenticateAdmin, async (req, res) => {
  try {
    const { toUserId, subject, message } = req.body;
    const admin = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    // Determina admin id (fallback a id se adminId non presente)
    const senderAdminId = admin && (admin.adminId || admin.id || (req.user && (req.user.adminId || req.user.id)));
    if (!senderAdminId) {
      console.error('Invio messaggio admin: mancante admin id nel token/session');
      return res.status(401).json({ error: 'session_expired', message: 'Sessione amministratore scaduta' });
    }
    // Salva messaggio su DB con riferimenti chiari admin/user
    const msg = await Message.create({
      from_admin_id: senderAdminId,
      to_user_id: toUserId,
      subject,
      message,
  name: admin && (admin.name || ((admin.first_name || '') + ' ' + (admin.last_name || '')).trim()) || 'Admin',
  email: admin && admin.email ? admin.email : '',
      phone: '',
      ip: req.ip
    });
    // Notifica il client user via Socket.IO server-side (se connesso)
    try {
      const io = req.app.get('io');
      if (io) {
        const room = `user_${toUserId}`;
        console.log(`Server emitting message:receive to ${room}`);
        io.to(room).emit('message:receive', {
          fromType: 'admin',
          fromId: senderAdminId,
          message,
          name: msg.name,
          email: msg.email,
          created_at: msg.created_at
        });
        try {
          // Update admin table info as well (admin sent a message to user)
          const knexConfig = require('../../knexfile');
          const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
          const cnt = await knex('messages')
            .count('id as count')
            .where(function() {
              this.where('from_user_id', toUserId).orWhere('to_user_id', toUserId);
            })
            .first();
          const message_count = cnt ? parseInt(cnt.count, 10) : 0;
          io.emit('admin:users:update', {
            userId: toUserId,
            message_count,
            name: admin && admin.name ? admin.name : null
          });
        } catch (err) {
          console.warn('Errore calcolo message_count dopo invio admin->user:', err);
        }
      }
    } catch (emitErr) {
      console.error('Errore emitting socket server-side:', emitErr);
    }

    res.status(201).json({ message: 'Messaggio inviato', data: msg });
  } catch (error) {
    console.error('Errore invio messaggio:', error);
    res.status(500).json({ error: "Errore durante l'invio del messaggio" });
  }
});

// Recupera conversazione 1:1 con user (tutti i messaggi admin-user)
router.get('/messages/conversation/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const admin = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    // Recupera solo i messaggi tra questo admin e questo utente
    const filters = {
      or: [
        { from_admin_id: admin.adminId, to_user_id: userId },
        { from_user_id: userId, to_admin_id: admin.adminId }
      ]
    };
    const result = await Message.search(filters, 1, 100);
    res.json({ messages: result.messages });
  } catch (error) {
    console.error('Errore recupero conversazione:', error);
    res.status(500).json({ error: 'Errore durante il recupero della conversazione' });
  }
});

// Statistiche avanzate
router.get('/stats', authenticateAdmin, async (req, res) => {
  const user = req.session && req.session.admin_user ? req.session.admin_user : req.user;
  try {
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    // Totale visite
    const viewsCountResult = await knex('visits').count('id as count');
    const viewsCount = viewsCountResult && viewsCountResult[0] ? parseInt(viewsCountResult[0].count, 10) : 0;

    // Visite ultimi 7 giorni (group by giorno)
    const visitsByDay = await knex('visits')
      .select(knex.raw(`to_char(created_at, 'DY') as day`))
      .count('id as count')
      .where('created_at', '>=', knex.raw(`now() - interval '6 days'`))
      .groupByRaw(`to_char(created_at, 'DY'), extract(doy from created_at)`) // per evitare mix giorni uguali di settimane diverse
      .orderByRaw(`min(created_at)`);

    // Prepara array per Chart.js (Lun-Dom)
    const daysOrder = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const daysIta = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
    let chartData = Array(7).fill(0);
    let chartLabels = daysIta;
    visitsByDay.forEach(row => {
      const idx = daysOrder.indexOf(row.day.charAt(0).toUpperCase() + row.day.slice(1,3).toLowerCase());
      if(idx !== -1) chartData[idx] = parseInt(row.count,10);
    });

    res.render('admin/stats', {
      title: 'Statistiche',
      user,
      views: viewsCount,
      chartLabels,
      chartData,
      activePage: 'stats',
      layout: 'layouts/admin-dashboard'
    });
  } catch (error) {
    console.error('Errore statistiche admin:', error);
    res.status(500).render('error', {
      title: 'Errore',
      error: 'Errore durante il recupero delle statistiche'
    });
  }
});

// --- Eventi (CRUD) per admin ---
// Lista eventi
router.get('/events', authenticateAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const q = (req.query.q || '').trim();

    // if q is present, apply simple title/description/location search
    const filters = {};
    if (!q) {
      const result = await Event.findAll({}, page, limit);
      const events = result.events || [];
      return res.render('admin/events', {
        title: 'Eventi',
        user: req.session && req.session.admin_user ? req.session.admin_user : req.user,
        events,
        pagination: result.pagination,
        q,
        activePage: 'events',
        layout: 'layouts/admin-dashboard'
      });
    }

    // custom search using knex for free text
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const offset = (page - 1) * limit;
    const ilike = `%${q}%`;
    const base = knex('events as e')
      .select('e.*', 'au.email as created_by_email', 'au.name as created_by_name')
      .leftJoin('admin_users as au', 'e.created_by', 'au.id')
      .where(function() {
        this.where('e.title', 'ilike', ilike)
          .orWhere('e.description', 'ilike', ilike)
          .orWhere('e.location', 'ilike', ilike);
      });

    const events = await base.clone().orderBy('e.event_date', 'desc').offset(offset).limit(limit);
    const totalRow = await base.clone().clearSelect().count('* as total').first();
    const total = totalRow ? parseInt(totalRow.total, 10) : 0;
    const pagination = { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };

    return res.render('admin/events', {
      title: 'Eventi',
      user: req.session && req.session.admin_user ? req.session.admin_user : req.user,
      events,
      pagination,
      q,
      activePage: 'events',
      layout: 'layouts/admin-dashboard'
    });
  } catch (err) {
    console.error('Errore listaggio eventi admin:', err);
    res.status(500).render('error', { title: 'Errore', error: 'Errore durante il recupero degli eventi' });
  }
});

// Render form nuovo evento
router.get('/events/new', authenticateAdmin, async (req, res) => {
  try {
    res.render('admin/event-form', {
      title: 'Crea Evento',
      user: req.session && req.session.admin_user ? req.session.admin_user : req.user,
      event: null,
      activePage: 'events',
      layout: 'layouts/admin-dashboard'
    });
  } catch (err) {
    console.error('Errore render nuovo evento:', err);
    res.status(500).render('error', { title: 'Errore', error: 'Errore durante la preparazione del form' });
  }
});

// Crea evento (API)
router.post('/events', authenticateAdmin, async (req, res) => {
  try {
    const admin = req.session && req.session.admin_user ? req.session.admin_user : req.user;
    const payload = {
      title: req.body.title,
      description: req.body.description,
      event_date: req.body.event_date,
      end_date: req.body.end_date || null,
      location: req.body.location,
      max_participants: req.body.max_participants || null,
      is_active: req.body.is_active === 'on' || req.body.is_active === true,
      created_by: admin.id || admin.adminId || admin.userId
    };

    // Build visibility_rules from simple form inputs (comma-separated)
    const rules = {};
    if (req.body.campo_attivita) rules.campo_attivita = req.body.campo_attivita.split(',').map(s => s.trim()).filter(Boolean);
    if (req.body.provincia) rules.provincia = req.body.provincia.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (req.body.nazione) rules.nazione = req.body.nazione.split(',').map(s => s.trim()).filter(Boolean);
    if (req.body.fatturato_min) rules.fatturato_min = parseFloat(req.body.fatturato_min) || 0;
    if (req.body.fatturato_max) rules.fatturato_max = parseFloat(req.body.fatturato_max) || null;
    if (Object.keys(rules).length > 0) payload.visibility_rules = rules;

  const event = await Event.create(payload);
  // set flash for HTML flows
  if (req.session) req.session.flash = { success: encodeURIComponent('Evento creato con successo') };
  if (req.accepts('html')) return res.redirect('/admin/events');
  return res.status(201).json({ message: 'Evento creato', event });
  } catch (err) {
    console.error('Errore creazione evento:', err);
    if (req.accepts('html')) return res.status(500).render('error', { title: 'Errore', error: 'Errore durante la creazione dell\'evento' });
    return res.status(500).json({ error: 'Errore creazione evento' });
  }
});

// Render edit form
router.get('/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) return res.status(404).render('error', { title: 'Non trovato', error: 'Evento non trovato' });
    // parse visibility_rules if stored as JSON string
    try {
      if (event.visibility_rules && typeof event.visibility_rules === 'string') {
        event.visibility_rules = JSON.parse(event.visibility_rules);
      }
    } catch (e) { /* ignore */ }
    res.render('admin/event-form', {
      title: 'Modifica Evento',
      user: req.session && req.session.admin_user ? req.session.admin_user : req.user,
      event,
      activePage: 'events',
      layout: 'layouts/admin-dashboard'
    });
  } catch (err) {
    console.error('Errore render edit evento:', err);
    res.status(500).render('error', { title: 'Errore', error: 'Errore durante il caricamento dell\'evento' });
  }
});

// Aggiorna evento
router.put('/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      title: req.body.title,
      description: req.body.description,
      event_date: req.body.event_date,
      end_date: req.body.end_date || null,
      location: req.body.location,
      max_participants: req.body.max_participants || null,
      is_active: req.body.is_active === 'on' || req.body.is_active === true
    };
    const rules = {};
    if (req.body.campo_attivita) rules.campo_attivita = req.body.campo_attivita.split(',').map(s => s.trim()).filter(Boolean);
    if (req.body.provincia) rules.provincia = req.body.provincia.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (req.body.nazione) rules.nazione = req.body.nazione.split(',').map(s => s.trim()).filter(Boolean);
    if (req.body.fatturato_min) rules.fatturato_min = parseFloat(req.body.fatturato_min) || 0;
    if (req.body.fatturato_max) rules.fatturato_max = parseFloat(req.body.fatturato_max) || null;
    if (Object.keys(rules).length > 0) updates.visibility_rules = rules;

  const event = await Event.update(id, updates);
  if (req.session) req.session.flash = { success: encodeURIComponent('Evento aggiornato') };
  if (req.accepts('html')) return res.redirect('/admin/events');
  return res.json({ message: 'Evento aggiornato', event });
  } catch (err) {
    console.error('Errore aggiornamento evento:', err);
    if (req.accepts('html')) return res.status(500).render('error', { title: 'Errore', error: 'Errore durante l\'aggiornamento dell\'evento' });
    return res.status(500).json({ error: 'Errore aggiornamento evento' });
  }
});

// Elimina evento (API DELETE)
router.delete('/events/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Event.delete(id);
    if (req.session) req.session.flash = { success: encodeURIComponent('Evento eliminato') };
    if (req.accepts('html')) return res.redirect('/admin/events');
    return res.json({ message: 'Evento eliminato' });
  } catch (err) {
    console.error('Errore eliminazione evento:', err);
    if (req.accepts('html')) return res.status(500).render('error', { title: 'Errore', error: 'Errore durante l\'eliminazione' });
    return res.status(500).json({ error: 'Errore eliminazione' });
  }
});

// Lista iscrizioni per evento (admin JSON)
router.get('/events/:id/registrations', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const knexConfig = require('../../knexfile');
    const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    const regs = await knex('event_registrations as er')
      .select('er.id', 'er.status', 'er.created_at', 'u.first_name', 'u.last_name', 'u.email', 'c.ragione_sociale as company')
      .leftJoin('users as u', 'er.user_id', 'u.id')
      .leftJoin('companies as c', 'er.company_id', 'c.id')
      .where('er.event_id', id)
      .orderBy('er.created_at', 'asc');
    return res.json({ registrations: regs });
  } catch (err) {
    console.error('Errore recupero iscrizioni evento:', err);
    return res.status(500).json({ error: 'Errore recupero iscrizioni' });
  }
});

module.exports = router;