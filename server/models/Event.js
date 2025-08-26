const db = require('../config/database');

class Event {
  // Crea un nuovo evento
  static async create(eventData) {
    const [event] = await db('events')
      .insert({
        title: eventData.title,
        description: eventData.description,
        event_date: eventData.event_date,
        end_date: eventData.end_date || null,
        location: eventData.location,
        max_participants: eventData.max_participants || null,
        is_active: eventData.is_active !== undefined ? eventData.is_active : true,
        visibility_rules: eventData.visibility_rules ? 
          JSON.stringify(eventData.visibility_rules) : null,
        created_by: eventData.created_by
      })
      .returning('*');
    
    return event;
  }

  // Trova tutti gli eventi (con filtri opzionali)
  static async findAll(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = db('events as e')
      .select(
        'e.*',
        'au.email as created_by_email',
        'au.name as created_by_name'
      )
      .leftJoin('admin_users as au', 'e.created_by', 'au.id');
    
    // Applica filtri
    if (filters.is_active !== undefined) {
      query = query.where('e.is_active', filters.is_active);
    }
    
    if (filters.upcoming) {
      query = query.where('e.event_date', '>=', db.fn.now());
    }
    
    if (filters.past) {
      query = query.where('e.event_date', '<', db.fn.now());
    }
    
    // Esegui query con paginazione
    const eventsQuery = query.clone().orderBy('e.event_date', 'desc').offset(offset).limit(limit);
    // Costruisci una query separata per il count che applica gli stessi where ma non il select di e.*
    const countQuery = db('events as e').count('* as total').leftJoin('admin_users as au', 'e.created_by', 'au.id');
    // Riapplica gli stessi where dal query originale
    if (filters.is_active !== undefined) countQuery.where('e.is_active', filters.is_active);
    if (filters.upcoming) countQuery.where('e.event_date', '>=', db.fn.now());
    if (filters.past) countQuery.where('e.event_date', '<', db.fn.now());

    const [events, total] = await Promise.all([
      eventsQuery,
      countQuery
    ]);
    
    return {
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }

  // Trova evento per ID
  static async findById(id) {
    return db('events as e')
      .select(
        'e.*',
        'au.email as created_by_email',
        'au.name as created_by_name'
      )
      .leftJoin('admin_users as au', 'e.created_by', 'au.id')
      .where('e.id', id)
      .first();
  }

  // Aggiorna evento
  static async update(id, updates) {
    // Prepara gli aggiornamenti
    const updateData = { ...updates };
    
    if (updates.visibility_rules) {
      updateData.visibility_rules = JSON.stringify(updates.visibility_rules);
    }
    
    updateData.updated_at = db.fn.now();
    
    const [event] = await db('events')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    return event;
  }

  // Elimina evento
  static async delete(id) {
    const [event] = await db('events')
      .where({ id })
      .del()
      .returning('id');
    
    return event;
  }

  // Verifica se un'azienda può vedere/registrarsi all'evento
  static async checkCompanyEligibility(eventId, companyId) {
    const event = await this.findById(eventId);
    
    if (!event || !event.visibility_rules) {
      return true; // Se non ci sono regole, tutti possono partecipare
    }
    
    const company = await db('companies')
      .where({ id: companyId })
      .first();
    
    if (!company) {
      return false;
    }
    
    const rules = event.visibility_rules;
    let eligible = true;
    
    // Verifica regole per campo_attivita
    if (rules.campo_attivita && rules.campo_attivita.length > 0) {
      eligible = eligible && rules.campo_attivita.includes(company.campo_attivita);
    }
    
    // Verifica regole per fatturato
    if (rules.fatturato_min && company.fatturato) {
      eligible = eligible && company.fatturato >= rules.fatturato_min;
    }
    
    if (rules.fatturato_max && company.fatturato) {
      eligible = eligible && company.fatturato <= rules.fatturato_max;
    }
    
    // Verifica regole per provincia
    if (rules.provincia && rules.provincia.length > 0) {
      eligible = eligible && rules.provincia.includes(company.provincia);
    }
    
    // Verifica regole per nazione
    if (rules.nazione && rules.nazione.length > 0) {
      eligible = eligible && rules.nazione.includes(company.nazione);
    }
    
    return eligible;
  }

  // Conta posti disponibili per un evento
  static async getAvailableSpaces(eventId) {
    const event = await db('events')
      .select('max_participants')
      .where({ id: eventId })
      .first();
    
    if (!event || !event.max_participants) {
      return null; // Nessun limite di partecipanti
    }
    
    const registrationCount = await db('event_registrations')
      .where('event_id', eventId)
      .whereIn('status', ['confirmed', 'pending'])
      .count('* as count')
      .first();
    
    return event.max_participants - parseInt(registrationCount.count);
  }

  // Eventi in base alla visibilità per un'azienda
  static async findVisibleEvents(companyId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    // Ottieni i dettagli dell'azienda
    const company = await db('companies')
      .where({ id: companyId })
      .first();
    
    if (!company) {
      throw new Error('Company not found');
    }
    
    // Query base per eventi attivi
    let query = db('events as e')
      .select(
        'e.*',
        'au.email as created_by_email',
        'au.name as created_by_name'
      )
      .leftJoin('admin_users as au', 'e.created_by', 'au.id')
      .where('e.is_active', true)
      .where('e.event_date', '>=', db.fn.now());
    
    // Filtra per regole di visibilità
    query = query.andWhere(function() {
      this.where('e.visibility_rules', null)
        .orWhere(function() {
          // Verifica regole per campo_attivita
          if (company.campo_attivita) {
            this.orWhereRaw("e.visibility_rules->>'campo_attivita' LIKE ?", [`%${company.campo_attivita}%`]);
          }
          
          // Verifica regole per provincia
          if (company.provincia) {
            this.orWhereRaw("e.visibility_rules->>'provincia' LIKE ?", [`%${company.provincia}%`]);
          }
          
          // Verifica regole per nazione
          if (company.nazione) {
            this.orWhereRaw("e.visibility_rules->>'nazione' LIKE ?", [`%${company.nazione}%`]);
          }
          
          // Verifica regole per fatturato (supporta solo min, solo max o entrambi)
          if (company.fatturato) {
            const companyFatt = parseFloat(company.fatturato);
            // usa COALESCE per trattare fatturato_max mancante come molto grande
            this.orWhereRaw("(e.visibility_rules->>'fatturato_min')::numeric <= ? AND COALESCE((e.visibility_rules->>'fatturato_max')::numeric, 999999999999) >= ?", [companyFatt, companyFatt]);
          }
        });
    });
    
    // Esegui query con paginazione (ordina dal più recente al meno recente)
    const eventsQuery = query.clone().orderBy('e.event_date', 'desc').offset(offset).limit(limit);
    // Riusa la stessa query per il count per essere coerenti con i filtri
    const countQuery = query.clone().clearSelect().clearOrder().count('* as total');
    const [events, total] = await Promise.all([
      eventsQuery,
      countQuery
    ]);
    
    return {
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
}

module.exports = Event;