const db = require('../config/database');

class Visit {
  // Registra una nuova visita
  static async create(visitData) {
    const [visit] = await db('visits')
      .insert({
        ip_address: visitData.ip,
        user_agent: visitData.user_agent,
        page: visitData.page,
        referrer: visitData.referrer || null,
        country: visitData.country || null,
        city: visitData.city || null
      })
      .returning('*');
    
    return visit;
  }

  // Statistiche visite
  static async getStats(timeframe = 'day') {
    let interval;
    switch(timeframe) {
      case 'hour':
        interval = '1 hour';
        break;
      case 'day':
        interval = '1 day';
        break;
      case 'week':
        interval = '1 week';
        break;
      case 'month':
        interval = '1 month';
        break;
      default:
        interval = '1 day';
    }
    
    return db('visits')
      .select(
        db.raw('COUNT(*) as total_visits'),
        db.raw('COUNT(DISTINCT ip_address) as unique_visitors'),
        db.raw('MAX(created_at) as last_visit'),
        'page',
        db.raw('COUNT(*) as page_visits')
      )
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${interval}'`))
      .groupBy('page')
      .orderBy('page_visits', 'desc');
  }

  // Visite per periodo
  static async getVisitsByPeriod(period = 'day') {
    let groupBy;
    switch(period) {
      case 'hour':
        groupBy = db.raw("DATE_TRUNC('hour', created_at)");
        break;
      case 'day':
        groupBy = db.raw('DATE(created_at)');
        break;
      case 'week':
        groupBy = db.raw("DATE_TRUNC('week', created_at)");
        break;
      case 'month':
        groupBy = db.raw("DATE_TRUNC('month', created_at)");
        break;
      default:
        groupBy = db.raw('DATE(created_at)');
    }
    
    return db('visits')
      .select(
        groupBy.as('period'),
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT ip_address) as unique_visits')
      )
      .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
      .groupBy('period')
      .orderBy('period', 'desc');
  }

  // Pagine più visitate
  static async getTopPages(limit = 10) {
    return db('visits')
      .select(
        'page',
        db.raw('COUNT(*) as visits'),
        db.raw('COUNT(DISTINCT ip_address) as unique_visits')
      )
      .groupBy('page')
      .orderBy('visits', 'desc')
      .limit(limit);
  }

  // Visitatori unici per giorno
  static async getUniqueVisitors(days = 7) {
    return db('visits')
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('COUNT(DISTINCT ip_address) as unique_visitors')
      )
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${days} days'`))
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'desc');
  }

  // Dettagli visita con informazioni geografiche
  static async getVisitDetails(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [visits, total] = await Promise.all([
      db('visits')
        .select('*')
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      db('visits').count('* as total')
    ]);
    
    return {
      visits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }

  // Filtra visite per paese, città, ecc.
  static async filterVisits(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = db('visits');
    
    // Applica filtri
    if (filters.country) {
      query = query.where('country', 'ilike', `%${filters.country}%`);
    }
    
    if (filters.city) {
      query = query.where('city', 'ilike', `%${filters.city}%`);
    }
    
    if (filters.page) {
      query = query.where('page', 'ilike', `%${filters.page}%`);
    }
    
    // Esegui query con paginazione
    const [visits, total] = await Promise.all([
      query.clone()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    
    return {
      visits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
}

module.exports = Visit;