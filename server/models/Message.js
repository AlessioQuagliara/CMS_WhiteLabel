const db = require('../config/database');

class Message {
  // Crea un nuovo messaggio 
  static async create(messageData) {
    // Non permettere insert orfani: richiedi sempre un mittente (user o admin).
    if ((!messageData.from_user_id && !messageData.from_admin_id) || (messageData.from_user_id === null && messageData.from_admin_id === null)) {
      // Log di debug e fallimento esplicito per far emergere il chiamante che non imposta gli id
      console.warn('Warning: creating message without from_user_id or from_admin_id:', {
        name: messageData.name,
        email: messageData.email,
        message: messageData.message
      });
      throw new Error('Message.create: missing sender id (from_user_id or from_admin_id required)');
    }

    try {
      const [message] = await db('messages')
        .insert({
          name: messageData.name || 'Sconosciuto',
          // ensure NOT NULL column isn't violated
          email: messageData.email || '',
          phone: messageData.phone || null,
          subject: messageData.subject || null,
          message: messageData.message,
          ip_address: messageData.ip || null,
          from_user_id: messageData.from_user_id || null,
          to_user_id: messageData.to_user_id || null,
          from_admin_id: messageData.from_admin_id || null,
          to_admin_id: messageData.to_admin_id || null
        })
        .returning('*');
      return message;
    } catch (err) {
      console.error('Message.create DB error:', err);
      throw err;
    }
  }

  // Trova tutti i messaggi (con paginazione)
  static async findAll(page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    const [messages, total] = await Promise.all([
      db('messages')
        .select('*')
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      db('messages').count('* as total')
    ]);
    
    return {
      messages,
      total: parseInt(total[0].total),
      page,
      limit,
      pages: Math.ceil(total[0].total / limit)
    };
  }

  // Trova messaggio per ID
  static async findById(id) {
    return db('messages')
      .where({ id })
      .first();
  }

  // Marca messaggio come letto
  static async markAsRead(id) {
    const [message] = await db('messages')
      .where({ id })
      .update({ read: true })
      .returning('*');
    
    return message;
  }

  // Elimina messaggio
  static async delete(id) {
    const [message] = await db('messages')
      .where({ id })
      .del()
      .returning('id');
    
    return message;
  }

  // Conta messaggi non letti
  static async countUnread() {
    const result = await db('messages')
      .where({ read: false })
      .count('* as count')
      .first();
    
    return parseInt(result.count);
  }

  // Cerca messaggi con filtri
  static async search(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    
    let query = db('messages');
    
    // Applica filtri
    if (filters.email) {
      query = query.where('email', 'ilike', `%${filters.email}%`);
    }
    if (filters.name) {
      query = query.where('name', 'ilike', `%${filters.name}%`);
    }
    if (filters.read !== undefined) {
      query = query.where({ read: filters.read });
    }
    // Nuovi filtri per chat 1:1 (solo se definiti e non null)
    if (filters.from_user_id !== undefined && filters.from_user_id !== null) {
      query = query.where('from_user_id', filters.from_user_id);
    }
    if (filters.to_user_id !== undefined && filters.to_user_id !== null) {
      query = query.where('to_user_id', filters.to_user_id);
    }
    if (filters.from_admin_id !== undefined && filters.from_admin_id !== null) {
      query = query.where('from_admin_id', filters.from_admin_id);
    }
    if (filters.to_admin_id !== undefined && filters.to_admin_id !== null) {
      query = query.where('to_admin_id', filters.to_admin_id);
    }
    // Supporto OR logico (array di condizioni), ignora condizioni con valori undefined/null
    if (filters.or && Array.isArray(filters.or)) {
      query = query.where(function() {
        filters.or.forEach((cond, i) => {
          // Rimuovi chiavi undefined/null
          const cleanCond = Object.fromEntries(Object.entries(cond).filter(([k, v]) => v !== undefined && v !== null));
          if (Object.keys(cleanCond).length === 0) return;
          if (i === 0) {
            this.where(cleanCond);
          } else {
            this.orWhere(cleanCond);
          }
        });
      });
    }
    
    // Esegui query con paginazione
    const [messages, total] = await Promise.all([
      query.clone()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    
    return {
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
  // Conta il numero totale di messaggi
  static async count() {
  const result = await db('messages').count('* as count').first();
  return parseInt(result.count);
}
}

module.exports = Message;