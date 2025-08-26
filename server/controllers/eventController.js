const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration');
const Company = require('../models/Company');

// Ottieni tutti gli eventi
exports.getAllEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, upcoming, past, active } = req.query;
    
    const filters = {};
    if (upcoming === 'true') filters.upcoming = true;
    if (past === 'true') filters.past = true;
    if (active !== undefined) filters.is_active = active === 'true';
    
    const events = await Event.findAll(filters, parseInt(page), parseInt(limit));
    
    // Per ogni evento, verifica se l'utente corrente può partecipare
    if (req.user && req.user.userId) {
      const company = await Company.findByUserId(req.user.userId);
      
      if (company) {
        for (let event of events.events) {
          event.can_register = await Event.checkCompanyEligibility(event.id, company.id);
          event.available_spaces = await Event.getAvailableSpaces(event.id);
        }
      }
    }
    
    res.json(events);
  } catch (error) {
    console.error('Errore recupero eventi:', error);
    res.status(500).json({ error: 'Errore durante il recupero degli eventi' });
  }
};

// Ottieni evento specifico
exports.getEvent = async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({ error: 'Evento non trovato' });
    }
    
    // Verifica se l'utente corrente può partecipare
    if (req.user && req.user.userId) {
      const company = await Company.findByUserId(req.user.userId);
      
      if (company) {
        event.can_register = await Event.checkCompanyEligibility(event.id, company.id);
        event.available_spaces = await Event.getAvailableSpaces(event.id);
        
        // Verifica se l'utente è già registrato
        const registration = await EventRegistration.isUserRegistered(id, req.user.userId);
        event.user_registration = registration;
      }
    }
    
    res.json({ event });
  } catch (error) {
    console.error('Errore recupero evento:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'evento' });
  }
};

// Crea nuovo evento (solo admin)
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      event_date,
      end_date,
      location,
      max_participants,
      is_active,
      visibility_rules
    } = req.body;
    
    // Validazione
    if (!title || !description || !event_date || !location) {
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori' });
    }
    
    const eventData = {
      title,
      description,
      event_date,
      end_date,
      location,
      max_participants,
      is_active: is_active !== undefined ? is_active : true,
      visibility_rules,
      created_by: req.user.userId
    };
    
    const event = await Event.create(eventData);
    
    res.status(201).json({
      message: 'Evento creato con successo',
      event
    });
  } catch (error) {
    console.error('Errore creazione evento:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'evento' });
  }
};

// Aggiorna evento (solo admin)
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const event = await Event.update(id, updates);
    
    res.json({
      message: 'Evento aggiornato con successo',
      event
    });
  } catch (error) {
    console.error('Errore aggiornamento evento:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'evento' });
  }
};

// Elimina evento (solo admin)
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    
    await Event.delete(id);
    
    res.json({ message: 'Evento eliminato con successo' });
  } catch (error) {
    console.error('Errore eliminazione evento:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'evento' });
  }
};

// Registra utente a evento
exports.registerToEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { notes } = req.body;
    
    // Verifica se l'evento esiste
    const event = await Event.findById(eventId);
    
    if (!event || !event.is_active) {
      return res.status(404).json({ error: 'Evento non trovato o non attivo' });
    }
    
    // Ottieni company dell'utente
    const company = await Company.findByUserId(req.user.userId);
    
    if (!company) {
      return res.status(400).json({ error: 'Dati aziendali non trovati. Completa il profilo aziendale prima di registrarti.' });
    }
    
    // Verifica se l'azienda può partecipare all'evento
    const canRegister = await Event.checkCompanyEligibility(eventId, company.id);
    
    if (!canRegister) {
      return res.status(403).json({ error: 'La tua azienda non soddisfa i requisiti per partecipare a questo evento' });
    }
    
    // Verifica se ci sono posti disponibili
    const availableSpaces = await Event.getAvailableSpaces(eventId);
    
    let status = 'pending';
    
    if (availableSpaces !== null && availableSpaces <= 0) {
      status = 'waiting_list';
    }
    
    // Crea registrazione
    const registrationData = {
      event_id: parseInt(eventId),
      user_id: req.user.userId,
      company_id: company.id,
      status,
      notes
    };
    
    const registration = await EventRegistration.create(registrationData);
    
    res.status(201).json({
      message: status === 'waiting_list' 
        ? 'Registrazione effettuata. Sei in lista d\'attesa.' 
        : 'Registrazione effettuata con successo',
      registration
    });
  } catch (error) {
    console.error('Errore registrazione evento:', error);
    
    if (error.message === 'User already registered for this event') {
      return res.status(400).json({ error: 'Sei già registrato a questo evento' });
    }
    
    res.status(500).json({ error: 'Errore durante la registrazione all\'evento' });
  }
};

// Annulla registrazione a evento
exports.cancelRegistration = async (req, res) => {
  try {
    const { eventId } = req.params;
    
    // Verifica se l'utente è registrato all'evento
    const registration = await EventRegistration.isUserRegistered(eventId, req.user.userId);
    
    if (!registration) {
      return res.status(404).json({ error: 'Registrazione non trovata' });
    }
    
    // Annulla registrazione
    await EventRegistration.updateStatus(registration.id, 'cancelled');
    
    res.json({ message: 'Registrazione annullata con successo' });
  } catch (error) {
    console.error('Errore cancellazione registrazione:', error);
    res.status(500).json({ error: 'Errore durante la cancellazione della registrazione' });
  }
};

// Ottieni registrazioni per evento (solo admin)
exports.getEventRegistrations = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    
    const registrations = await EventRegistration.findByEventId(eventId, filters);
    
    res.json({ registrations });
  } catch (error) {
    console.error('Errore recupero registrazioni:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle registrazioni' });
  }
};

// Aggiorna stato registrazione (solo admin)
exports.updateRegistrationStatus = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'waiting_list'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Stato non valido' });
    }
    
    const registration = await EventRegistration.updateStatus(registrationId, status);
    
    res.json({
      message: 'Stato registrazione aggiornato',
      registration
    });
  } catch (error) {
    console.error('Errore aggiornamento stato registrazione:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dello stato della registrazione' });
  }
};

// Marca partecipazione (solo admin)
exports.markAttendance = async (req, res) => {
  try {
    const { registrationId } = req.params;
    const { attended } = req.body;
    
    const registration = await EventRegistration.markAttendance(registrationId, attended);
    
    res.json({
      message: attended ? 'Partecipazione confermata' : 'Partecipazione annullata',
      registration
    });
  } catch (error) {
    console.error('Errore aggiornamento partecipazione:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento della partecipazione' });
  }
};

// Ottieni le registrazioni dell'utente corrente
exports.getUserRegistrations = async (req, res) => {
  try {
    const registrations = await EventRegistration.findByUserId(req.user.userId);
    
    res.json({ registrations });
  } catch (error) {
    console.error('Errore recupero registrazioni utente:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle tue registrazioni' });
  }
};