const db = require('../config/database');

class Company {
  // Crea una nuova company associata a un user
  static async create(companyData) {
    const [company] = await db('companies')
      .insert({
        user_id: companyData.user_id,
        ragione_sociale: companyData.ragione_sociale,
        campo_attivita: companyData.campo_attivita,
        piva: companyData.piva,
        codice_fiscale: companyData.codice_fiscale || null,
        fatturato: companyData.fatturato || null,
        pec: companyData.pec,
        sdi: companyData.sdi,
        indirizzo: companyData.indirizzo,
        citta: companyData.citta,
        cap: companyData.cap,
        provincia: companyData.provincia,
        nazione: companyData.nazione || 'Italia',
        telefono: companyData.telefono || null,
        sito_web: companyData.sito_web || null
      })
      .returning('*');
    
    return company;
  }

  // Trova company per user ID
  static async findByUserId(userId) {
    return db('companies')
      .where({ user_id: userId })
      .first();
  }

  // Trova company per PIVA
  static async findByPiva(piva) {
    return db('companies')
      .where({ piva })
      .first();
  }

  // Aggiorna company
  static async update(companyId, updates) {
    const [company] = await db('companies')
      .where({ id: companyId })
      .update({
        ...updates,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return company;
  }

  // Elimina company
  static async delete(companyId) {
    const [company] = await db('companies')
      .where({ id: companyId })
      .del()
      .returning('id');
    
    return company;
  }

  // Cerca companies per campo attività
  static async findByActivity(campoAttivita) {
    return db('companies')
      .where('campo_attivita', 'ilike', `%${campoAttivita}%`);
  }

  // Ottieni tutte le companies (con paginazione)
  static async findAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const query = db('companies as c')
      .select(
        'c.*',
        'u.email',
        'u.name as user_name'
      )
      .join('users as u', 'c.user_id', 'u.id')
      .orderBy('c.created_at', 'desc')
      .offset(offset)
      .limit(limit);
    
    const countQuery = db('companies').count('* as total');
    
    const [companies, totalResult] = await Promise.all([
      query,
      countQuery
    ]);
    
    return {
      companies,
      total: parseInt(totalResult[0].total),
      page,
      limit,
      pages: Math.ceil(totalResult[0].total / limit)
    };
  }

  // Cerca companies con filtri avanzati
  static async search(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = db('companies as c')
      .select(
        'c.*',
        'u.email',
        'u.name as user_name'
      )
      .join('users as u', 'c.user_id', 'u.id');
    
    // Applica filtri
    if (filters.campo_attivita) {
      query = query.where('c.campo_attivita', 'ilike', `%${filters.campo_attivita}%`);
    }
    
    if (filters.ragione_sociale) {
      query = query.where('c.ragione_sociale', 'ilike', `%${filters.ragione_sociale}%`);
    }
    
    if (filters.provincia) {
      query = query.where('c.provincia', filters.provincia);
    }
    
    if (filters.citta) {
      query = query.where('c.citta', 'ilike', `%${filters.citta}%`);
    }
    
    // Esegui query con paginazione
    const [companies, total] = await Promise.all([
      query.clone()
        .orderBy('c.created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    
    return {
      companies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
}

module.exports = Company;