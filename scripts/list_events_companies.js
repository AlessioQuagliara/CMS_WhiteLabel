const knexConfig = require('../knexfile');
const env = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[env]);

(async () => {
  try {
    console.log('Using DB config for env:', env);
    const events = await knex('events').select('*').orderBy('event_date', 'desc').limit(50);
    const companies = await knex('companies').select('*').limit(50);
    console.log('\n=== events (latest 50) ===');
    console.log(JSON.stringify(events, null, 2));
    console.log('\n=== companies (first 50) ===');
    console.log(JSON.stringify(companies, null, 2));
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await knex.destroy();
  }
})();
