const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class User {
  // Crea un nuovo utente
  static async create(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const [user] = await db('users')
      .insert({
        email: userData.email,
        password: hashedPassword,
        first_name: userData.first_name || null,
        last_name: userData.last_name || null,
        phone: userData.phone || null,
        verification_token: verificationToken,
        verified: false
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'phone', 'verified', 'created_at']);
    // Restituisco anche il token di verifica
    return { ...user, verification_token: verificationToken };
  }

  // Trova utente per email
  static async findByEmail(email) {
    return db('users')
      .where({ email })
      .first();
  }

  // Trova utente per ID
  static async findById(id) {
    return db('users')
      .select('id', 'email', 'first_name', 'last_name', 'phone', 'verified', 'created_at')
      .where({ id })
      .first();
  }

  // Verifica password
  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Aggiorna verifica email
  static async verifyEmail(userId) {
    const [user] = await db('users')
      .where({ id: userId })
      .update({ 
        verified: true, 
        verification_token: null 
      })
      .returning('*');
    
    return user;
  }

  // Aggiorna password
  static async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const [user] = await db('users')
      .where({ id: userId })
      .update({ password: hashedPassword })
      .returning(['id', 'email']);
    
    return user;
  }

  // Trova utente per token di verifica
  static async findByVerificationToken(token) {
    return db('users')
      .where({ verification_token: token })
      .first();
  }

  // Aggiorna profilo utente
  static async updateProfile(userId, updates) {
    const allowedFields = ['first_name', 'last_name', 'email', 'phone'];
    const updateData = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) updateData[key] = updates[key];
    }
    const [user] = await db('users')
      .where({ id: userId })
      .update(updateData)
      .returning(['id', 'email', 'first_name', 'last_name', 'phone']);
    return user;
  }

  // Elimina utente
  static async delete(userId) {
    const [user] = await db('users')
      .where({ id: userId })
      .del()
      .returning('id');
    
    return user;
  }

  // Ottieni company associata all'utente
  static async getCompany(userId) {
    return db('companies')
      .where({ user_id: userId })
      .first();
  }

  // Crea o aggiorna company associata all'utente
  static async upsertCompany(userId, companyData) {
    const existingCompany = await this.getCompany(userId);
    
    if (existingCompany) {
      const Company = require('./Company');
      return await Company.update(existingCompany.id, companyData);
    } else {
      const Company = require('./Company');
      return await Company.create({ ...companyData, user_id: userId });
    }
  }

  // Cerca utenti con filtri
  static async search(filters = {}, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    let query = db('users')
      .select('id', 'email', 'first_name', 'last_name', 'phone', 'verified', 'created_at');
    // Applica filtri
    if (filters.email) {
      query = query.where('email', 'ilike', `%${filters.email}%`);
    }
    if (filters.first_name) {
      query = query.where('first_name', 'ilike', `%${filters.first_name}%`);
    }
    if (filters.last_name) {
      query = query.where('last_name', 'ilike', `%${filters.last_name}%`);
    }
    if (filters.verified !== undefined) {
      query = query.where({ verified: filters.verified });
    }
    // Esegui query con paginazione
    const [users, total] = await Promise.all([
      query.clone()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit),
      query.clone().count('* as total')
    ]);
    return {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total[0].total),
        pages: Math.ceil(total[0].total / limit)
      }
    };
  }
  // Conta il numero totale di utenti
  static async count() {
  const result = await db('users').count('* as count').first();
  return parseInt(result.count);
}
}

module.exports = User;