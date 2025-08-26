const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class Admin {
  // Crea un nuovo admin
  static async create(adminData) {
    const { email, password, name = null, first_name = null, last_name = null } = adminData;
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // prefer explicit first/last if provided, otherwise split name
    let fn = first_name;
    let ln = last_name;
    if ((!fn || !ln) && name) {
      const parts = name.trim().split(/\s+/);
      fn = fn || parts.slice(0, parts.length - 1).join(' ') || parts[0] || null;
      ln = ln || (parts.length > 1 ? parts[parts.length - 1] : null);
    }

    const insertPayload = {
      email,
      password: hashedPassword,
      name: name || (fn || ln ? `${fn || ''} ${ln || ''}`.trim() : null),
      first_name: fn || null,
      last_name: ln || null,
      verification_token: verificationToken,
      verified: false
    };

    const [admin] = await db('admin_users')
      .insert(insertPayload)
      .returning(['id', 'email', 'name', 'first_name', 'last_name', 'verified', 'created_at']);

    // Ritorna anche il token di verifica
    return { ...admin, verification_token: verificationToken };
  }

  // Trova admin per email
  static async findByEmail(email) {
    return db('admin_users')
      .where({ email })
      .first();
  }

  // Trova admin per ID
  static async findById(id) {
    return db('admin_users')
      .select('id', 'email', 'name', 'first_name', 'last_name', 'verified', 'created_at')
      .where({ id })
      .first();
  }

  // Verifica password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Aggiorna verifica email
  static async verifyEmail(adminId) {
    const [admin] = await db('admin_users')
      .where({ id: adminId })
      .update({ 
        verified: true, 
        verification_token: null 
      })
      .returning('*');
    
    return admin;
  }

  // Aggiorna password
  static async updatePassword(adminId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [admin] = await db('admin_users')
      .where({ id: adminId })
      .update({ password: hashedPassword })
      .returning(['id', 'email']);
    
    return admin;
  }

  // Trova admin per token di verifica
  static async findByVerificationToken(token) {
    return db('admin_users')
      .where({ verification_token: token })
      .first();
  }

  // Ottieni tutti gli admin
  static async findAll() {
    return db('admin_users')
      .select('id', 'email', 'name', 'first_name', 'last_name', 'verified', 'created_at')
      .orderBy('created_at', 'desc');
  }

  // Elimina admin
  static async delete(adminId) {
    const [admin] = await db('admin_users')
      .where({ id: adminId })
      .del()
      .returning('id');
    
    return admin;
  }

  // Aggiorna dati admin
  static async update(adminId, updates) {
    // Rimuovi campi che non dovrebbero essere aggiornati
    const { password, verified, ...safeUpdates } = updates;
  const allowedFields = ['name', 'email', 'first_name', 'last_name'];
    const updateData = {};
    for (const key of allowedFields) {
      if (safeUpdates[key] !== undefined) updateData[key] = safeUpdates[key];
    }
    updateData.updated_at = db.fn.now();
    const [admin] = await db('admin_users')
      .where({ id: adminId })
      .update(updateData)
      .returning(['id', 'email', 'name', 'first_name', 'last_name', 'verified', 'created_at', 'updated_at']);
    return admin;
  }

  // Cerca admin con filtri
  static async search(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    let query = db('admin_users')
      .select('id', 'email', 'name', 'verified', 'created_at');
    // Applica filtri
    if (filters.email) {
      query = query.where('email', 'ilike', `%${filters.email}%`);
    }
    if (filters.name) {
      query = query.where(function() {
        this.where('name', 'ilike', `%${filters.name}%`)
          .orWhere('first_name', 'ilike', `%${filters.name}%`)
          .orWhere('last_name', 'ilike', `%${filters.name}%`);
      });
    }
    if (filters.verified !== undefined) {
      query = query.where({ verified: filters.verified });
    }
    // Esegui query con paginazione
  const [admins, total] = await Promise.all([
      query.clone()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    return {
      admins,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
  // Conta il numero totale di admin
  static async count() {
  const result = await db('admin_users').count('* as count').first();
  return parseInt(result.count);
}
}

module.exports = Admin;