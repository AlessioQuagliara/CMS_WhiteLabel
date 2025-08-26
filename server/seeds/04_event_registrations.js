// server/seeds/04_event_registrations.js
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('event_registrations').del();
  
  // Ottieni i primi ID di eventi, utenti e aziende
  const events = await knex('events').select('id');
  const users = await knex('users').select('id');
  const companies = await knex('companies').select('id');
  
  if (events.length === 0 || users.length === 0 || companies.length === 0) {
    console.log('Dati insufficienti, saltando il seed delle registrazioni eventi');
    return;
  }
  
  // Inserts seed entries
  await knex('event_registrations').insert([
    {
      event_id: events[0].id,
      user_id: users[0].id,
      company_id: companies[0].id,
      status: 'confirmed',
      notes: 'Parteciperò all\'evento',
      attended: false
    }
  ]);
};