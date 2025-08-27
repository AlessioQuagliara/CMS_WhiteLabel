const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Middleware per supportare PUT/DELETE nei form HTML
const methodOverride = require('method-override');

// Inizializza l'app Express
const app = express();

// Import routes e middleware
const { initDatabase } = require('./utils/dbInit');
const userAuthRoutes = require('./routes/userAuth');
const userDashboardRoutes = require('./routes/userDashboard');
const adminAuthRoutes = require('./routes/adminAuth');
const adminDashboardRoutes = require('./routes/adminDashboard');
const emailRoutes = require('./routes/email');
const visitRoutes = require('./routes/visit');
const { authenticateToken } = require('./middleware/userAuth');
const { authenticateAdmin } = require('./middleware/adminAuth');
const companyRoutes = require('./routes/company');
const eventRoutes = require('./routes/events');

// Import models for dashboard data
const User = require('./models/User');
const Admin = require('./models/Admin');
const Message = require('./models/Message');
const Visit = require('./models/Visit');

dotenv.config();

// Configurazione EJS per le views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main'); // Layout di default

// Configurazione middleware
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Abilita l'override del metodo tramite query _method (necessario per i form che fanno PUT/DELETE)
app.use(methodOverride('_method'));

// Middleware per debug
app.use((req, res, next) => {
  console.log(`📩 Richiesta ricevuta: ${req.method} ${req.url}`);
  next();
});

// Configurazione sessione
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Simple flash middleware using session
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || {};
  // clear flash after exposing
  delete req.session.flash;
  next();
});

// ==================== ROUTES PRINCIPALI ====================

var sitoOnline = "noindex, nofollow";

// Redirect /index a /
app.get('/index', (req, res) => {
  res.redirect('/');
});

// Home page
app.get('/', (req, res) => {
  res.render('index', {
    layout: 'layouts/main',
    SEO: {
      title: 'Home Page',
      description: 'Benvenuto nella Home Page',
      keywords: 'home, page, welcome',
      sitoOnline
    }
  });
});

// Home page
app.get('/chi-siamo', (req, res) => {
  res.render('about-us', {
    layout: 'layouts/main',
    SEO: {
      title: 'Chi Siamo',
      description: 'Scopri di più su di noi',
      keywords: 'chi siamo, about us',
      sitoOnline
    }
  });
});

// ==================== ROUTES PER PAGINE EJS ====================

// Redirect alle route di autenticazione esistenti
app.get('/login', (req, res) => res.redirect('/auth/login'));
app.get('/register', (req, res) => res.redirect('/auth/register'));
app.get('/forgot-password', (req, res) => res.redirect('/auth/forgot-password'));
app.get('/admin/login', (req, res) => res.redirect('/admin/auth/login'));
app.get('/admin/register', (req, res) => res.redirect('/admin/auth/register'));

// Monta le route di autenticazione per il rendering EJS
app.use('/auth', userAuthRoutes);
app.use('/admin/auth', adminAuthRoutes);

// ==================== API ROUTES ====================


// API routes
app.use('/api/auth', userAuthRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api', emailRoutes);
// Visit tracker API
app.use('/api', visitRoutes);
app.use('/api/company', authenticateToken, companyRoutes);
app.use('/api/events', eventRoutes);

// Route dashboard admin EJS
app.use('/admin', authenticateAdmin, adminDashboardRoutes);
// Route pagine utente (dashboard, messages, events, settings)
app.use('/', authenticateToken, userDashboardRoutes);

// ==================== GESTIONE ERRORI ====================

// Gestione errori 404
app.use((req, res) => {
  res.status(404).render('404', { 
    title: 'Pagina Non Trovata',
    layout: 'layouts/main'
  });
});

// Gestione errori generici
app.use((err, req, res, next) => {
  console.error('❌ Errore:', err);
  res.status(500).render('error', {
    title: 'Errore del Server',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Si è verificato un errore',
    layout: 'layouts/main'
  });
});

// === SOCKET.IO SETUP ===
const http = require('http');
const { Server } = require('socket.io');

async function startServer() {
  try {
    await initDatabase();
  const PORT = process.env.PORT || 3000;
    const httpServer = http.createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });


    // === SOCKET.IO ROOM-BASED ===
    io.on('connection', (socket) => {
      console.log('🟢 Nuova connessione socket:', socket.id);

      // Identificazione: client invia tipo e id
      socket.on('identify', (data) => {
        if (data.type === 'user') {
          socket.join(`user_${data.id}`);
          console.log(`Utente ${data.id} si è unito alla room user_${data.id}`);
        } else if (data.type === 'admin') {
          socket.join(`admin_${data.id}`);
          console.log(`Admin ${data.id} si è unito alla room admin_${data.id}`);
        }
      });

      // Messaggi privati (forward-only): la persistenza è gestita dalle route HTTP server-side
      socket.on('message:private', (data) => {
        try {
          const { fromType, fromId, toType, toId, message, subject, name, email, phone } = data;
          if (!fromType || !fromId) {
            console.warn('Socket message:private received without fromType/fromId, skipping forward:', data);
            return;
          }

          // Inoltra il messaggio alla room appropriata: usa io.to(...) per includere anche eventuale mittente connesso
          const payload = { fromType: fromType || null, fromId, message, name, email, created_at: new Date() };
          if (toType === 'admin') {
            const roomName = `admin_${toId}`;
            const room = io.sockets.adapter.rooms.get(roomName);
            console.log(`Socket forward to ${roomName} | exists=${!!room} | size=${room ? room.size : 0}`);
            io.to(roomName).emit('message:receive', payload);
          } else if (toType === 'user') {
            const roomName = `user_${toId}`;
            const room = io.sockets.adapter.rooms.get(roomName);
            console.log(`Socket forward to ${roomName} | exists=${!!room} | size=${room ? room.size : 0}`);
            io.to(roomName).emit('message:receive', payload);
          }
        } catch (err) {
          console.error('Errore forwarding message via socket:', err);
        }
      });

      socket.on('disconnect', () => {
        console.log('🔴 Disconnessione socket:', socket.id);
      });
    });

    // Rendi io disponibile alle route
    app.set('io', io);

    // DEBUG endpoint (dev only) - restituisce le room attive e la loro dimensione
    // Rimuovere o proteggere in produzione
    app.get('/socket/debug', (req, res) => {
      try {
        const rooms = [];
        for (const [roomName, s] of io.sockets.adapter.rooms) {
          // socket.io rooms map contains both rooms named by socket ids and our custom rooms
          rooms.push({ room: roomName, size: s.size });
        }
        return res.json({ ok: true, rooms });
      } catch (err) {
        return res.status(500).json({ ok: false, error: String(err) });
      }
    });

    httpServer.listen(PORT, () => {
      console.log(`\n✅ Server avviato su http://localhost:${PORT}`);
      console.log(`📧 Mittente SMTP: ${process.env.SMTP_USER}`);
      console.log(`🗄️ Database: ${process.env.DB_NAME}`);
      console.log(`👤 Utente DB: ${process.env.DB_USER}`);
      console.log(`🌐 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`👁️ View Engine: EJS`);
      console.log('🟢 Socket.IO attivo');
    });

    process.on('SIGINT', () => {
      console.log('\n🔴 Server in chiusura...');
      httpServer.close(() => {
        console.log('Server chiuso correttamente');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Errore avvio server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;