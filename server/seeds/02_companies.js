// server/seeds/02_companies.js
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('companies').del();
  
  // Ottieni l'ID del primo utente
  const users = await knex('users').select('id');
  
  if (users.length === 0) {
    console.log('Nessun utente trovato, saltando il seed delle aziende');
    return;
  }
  
  // Inserts seed entries
  await knex('companies').insert([
    {
      user_id: users[0].id,
      ragione_sociale: 'Azienda di Esempio SRL',
      campo_attivita: 'Consulenza IT',
      piva: '12345678901',
      codice_fiscale: '12345678901',
      fatturato: 100000.00,
      pec: 'azienda@pec.example.com',
      sdi: '1234567',
      indirizzo: 'Via Roma 123',
      citta: 'Milano',
      cap: '20100',
      provincia: 'MI',
      nazione: 'Italia',
      telefono: '021234567',
      sito_web: 'https://www.aziendaexample.com'
    }
  ]);
};