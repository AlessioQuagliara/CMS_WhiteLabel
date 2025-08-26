const db = require('../config/database');

class EventRegistration {
  // Crea una nuova registrazione
  static async create(registrationData) {
    try {
      const [registration] = await db('event_registrations')
        .insert({
          event_id: registrationData.event_id,
          user_id: registrationData.user_id,
          company_id: registrationData.company_id,
          status: registrationData.status || 'pending',
          notes: registrationData.notes || null
        })
        .returning('*');
      
      return registration;
    } catch (error) {
      if (error.code === '23505') { // Violazione unique constraint
        throw new Error('User already registered for this event');
      }
      throw error;
    }
  }

  // Trova tutte le registrazioni per evento
  static async findByEventId(eventId, filters = {}) {
    let query = db('event_registrations as er')
      .select(
        'er.*',
        'u.email as user_email',
        'u.name as user_name',
        'u.phone as user_phone',
        'c.ragione_sociale',
        'c.campo_attivita',
        'c.piva',
        'c.pec'
      )
      .join('users as u', 'er.user_id', 'u.id')
      .join('companies as c', 'er.company_id', 'c.id')
      .where('er.event_id', eventId);
    
    if (filters.status) {
      query = query.where('er.status', filters.status);
    }
    
    return query.orderBy('er.created_at', 'desc');
  }

  // Trova tutte le registrazioni per utente
  static async findByUserId(userId) {
    return db('event_registrations as er')
      .select(
        'er.*',
        'e.title as event_title',
        'e.event_date',
        'e.location',
        'e.description'
      )
      .join('events as e', 'er.event_id', 'e.id')
      .where('er.user_id', userId)
      .orderBy('e.event_date', 'desc');
  }

  // Aggiorna stato registrazione
  static async updateStatus(registrationId, status) {
    const [registration] = await db('event_registrations')
      .where({ id: registrationId })
      .update({ 
        status,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return registration;
  }

  // Marca partecipazione
  static async markAttendance(registrationId, attended) {
    const [registration] = await db('event_registrations')
      .where({ id: registrationId })
      .update({ 
        attended,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return registration;
  }

  // Elimina registrazione
  static async delete(registrationId) {
    const [registration] = await db('event_registrations')
      .where({ id: registrationId })
      .del()
      .returning('id');
    
    return registration;
  }

  // Statistiche registrazioni per evento
  static async getStatsByEvent(eventId) {
    return db('event_registrations')
      .select('status')
      .count('* as count')
      .where('event_id', eventId)
      .groupBy('status');
  }

  // Controlla se un utente è già registrato a un evento
  static async isUserRegistered(eventId, userId) {
    return db('event_registrations')
      .select('id', 'status')
      .where({
        event_id: eventId,
        user_id: userId
      })
      .first();
  }

  // Trova registrazione per ID
  static async findById(registrationId) {
    return db('event_registrations as er')
      .select(
        'er.*',
        'u.email as user_email',
        'u.name as user_name',
        'u.phone as user_phone',
        'c.ragione_sociale',
        'c.campo_attivita',
        'c.piva',
        'c.pec',
        'e.title as event_title',
        'e.event_date',
        'e.location'
      )
      .join('users as u', 'er.user_id', 'u.id')
      .join('companies as c', 'er.company_id', 'c.id')
      .join('events as e', 'er.event_id', 'e.id')
      .where('er.id', registrationId)
      .first();
  }

  // Cerca registrazioni con filtri avanzati
  static async search(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = db('event_registrations as er')
      .select(
        'er.*',
        'u.email as user_email',
        'u.name as user_name',
        'c.ragione_sociale',
        'e.title as event_title',
        'e.event_date'
      )
      .join('users as u', 'er.user_id', 'u.id')
      .join('companies as c', 'er.company_id', 'c.id')
      .join('events as e', 'er.event_id', 'e.id');
    
    // Applica filtri
    if (filters.event_id) {
      query = query.where('er.event_id', filters.event_id);
    }
    
    if (filters.user_id) {
      query = query.where('er.user_id', filters.user_id);
    }
    
    if (filters.company_id) {
      query = query.where('er.company_id', filters.company_id);
    }
    
    if (filters.status) {
      query = query.where('er.status', filters.status);
    }
    
    if (filters.attended !== undefined) {
      query = query.where('er.attended', filters.attended);
    }
    
    // Esegui query con paginazione
    const [registrations, total] = await Promise.all([
      query.clone()
        .orderBy('er.created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    
    return {
      registrations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
}

module.exports = EventRegistration;