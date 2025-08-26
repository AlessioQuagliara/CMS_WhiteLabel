const express = require('express');
const router = express.Router();
const knexConfig = require('../../knexfile');
const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);

// Endpoint: POST /api/track-visit
router.post('/track-visit', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || null;
    const userAgent = req.body.user_agent || req.headers['user-agent'] || null;
    const page = req.body.page || '';
    const referrer = req.body.referrer || '';
    // Geolocalizzazione opzionale
    const country = req.body.country || null;
    const city = req.body.city || null;

    await knex('visits').insert({
      ip_address: ip,
      user_agent: userAgent,
      page,
      referrer,
      country,
      city
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Errore tracking visita:', err);
    return res.status(500).json({ success: false });
  }
});

module.exports = router;
