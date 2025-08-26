// server/seeds/03_events.js
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('events').del();
  
  // Ottieni l'ID del primo admin
  const admins = await knex('admin_users').select('id');
  
  if (admins.length === 0) {
    console.log('Nessun admin trovato, saltando il seed degli eventi');
    return;
  }
  
  // Inserts seed entries
  await knex('events').insert([
    {
      title: 'Evento di Presentazione',
      description: 'Un evento di presentazione delle nostre soluzioni',
      event_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 giorni da ora
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 ore dopo
      location: 'Milano, Via Roma 123',
      max_participants: 50,
      is_active: true,
      created_by: admins[0].id,
      visibility_rules: JSON.stringify({
        campo_attivita: ['Consulenza IT', 'Sviluppo Software'],
        fatturato_min: 50000
      })
    }
  ]);
};