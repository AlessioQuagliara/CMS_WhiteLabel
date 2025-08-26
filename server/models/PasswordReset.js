const db = require('../config/database');

class PasswordReset {
  // Crea token di reset per user
  static async createUserToken(userId, token, expiresAt) {
    const [resetToken] = await db('password_resets')
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt
      })
      .returning('*');
    
    return resetToken;
  }

  // Crea token di reset per admin
  static async createAdminToken(adminId, token, expiresAt) {
    const [resetToken] = await db('admin_password_resets')
      .insert({
        admin_user_id: adminId,
        token,
        expires_at: expiresAt
      })
      .returning('*');
    
    return resetToken;
  }

  // Trova token di reset per user
  static async findUserToken(token) {
    return db('password_resets as pr')
      .select('pr.*', 'u.email')
      .join('users as u', 'pr.user_id', 'u.id')
      .where('pr.token', token)
      .where('pr.expires_at', '>', db.fn.now())
      .first();
  }

  // Trova token di reset per admin
  static async findAdminToken(token) {
    return db('admin_password_resets as apr')
      .select('apr.*', 'au.email')
      .join('admin_users as au', 'apr.admin_user_id', 'au.id')
      .where('apr.token', token)
      .where('apr.expires_at', '>', db.fn.now())
      .first();
  }

  // Elimina token di reset per user
  static async deleteUserToken(token) {
    await db('password_resets')
      .where({ token })
      .del();
  }

  // Elimina token di reset per admin
  static async deleteAdminToken(token) {
    await db('admin_password_resets')
      .where({ token })
      .del();
  }

  // Pulisci token scaduti
  static async cleanupExpiredTokens() {
    await db('password_resets')
      .where('expires_at', '<=', db.fn.now())
      .del();
    
    await db('admin_password_resets')
      .where('expires_at', '<=', db.fn.now())
      .del();
  }

  // Trova token per user ID
  static async findByUserId(userId) {
    return db('password_resets')
      .where({ user_id: userId })
      .where('expires_at', '>', db.fn.now())
      .first();
  }

  // Trova token per admin ID
  static async findByAdminId(adminId) {
    return db('admin_password_resets')
      .where({ admin_user_id: adminId })
      .where('expires_at', '>', db.fn.now())
      .first();
  }
}

module.exports = PasswordReset;