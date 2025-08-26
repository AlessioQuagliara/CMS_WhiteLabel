// server/seeds/01_admin_users.js
exports.seed = async function(knex) {
  // Elimina tutte le entry esistenti
  await knex('admin_users').del();

  // Hash della password "Spotexsrl@2025"
  const passwordHash = '$2b$10$wQwQwQwQwQwQwQwQwQwQwOQwQwQwQwQwQwQwQwQwQwQwQwQwQ'; // Sostituisci con hash reale in produzione

  // Inserisce la nuova entry admin
  await knex('admin_users').insert([
    {
      email: 'info@spotexsrl.com',
      password: passwordHash,
  name: 'Alessio Quagliara',
      verified: true
    }
  ]);
};