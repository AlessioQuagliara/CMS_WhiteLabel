const knexConfig = require('../knexfile');
const env = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[env]);
const Event = require('../server/models/Event');

(async () => {
  try {
    const company = await knex('companies').where({id:1}).first();
    console.log('Company:', company);
    const res = await Event.findVisibleEvents(1, 1, 10);
    console.log('findVisibleEvents result:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await knex.destroy();
  }
})();
