const express = require('express');
const { sendContactEmail } = require('../utils/emailService');

const router = express.Router();

// Invia email di contatto
router.post('/send-email', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Validazione
    if (!name || !email || !message) {
      return res.status(400).json({ 
        error: 'Nome, email e messaggio sono obbligatori' 
      });
    }
    
    // Invia email
    await sendContactEmail({ name, email, phone, subject, message });
    
    res.json({ message: 'Email inviata con successo' });
  } catch (error) {
    console.error('Errore invio email:', error);
    res.status(500).json({ error: 'Errore durante l\'invio dell\'email' });
  }
});

module.exports = router;