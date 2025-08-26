const Company = require('../models/Company');
const User = require('../models/User');

// Ottieni company dell'utente
exports.getCompany = async (req, res) => {
  try {
    const company = await User.getCompany(req.user.userId);
    
    if (!company) {
      return res.status(404).json({ error: 'Dati aziendali non trovati' });
    }
    
    res.json(company);
  } catch (error) {
    console.error('Errore recupero dati aziendali:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati aziendali' });
  }
};

// Crea o aggiorna company
exports.upsertCompany = async (req, res) => {
  try {
    const {
      ragione_sociale,
      campo_attivita,
      piva,
      codice_fiscale,
      fatturato,
      pec,
      sdi,
      indirizzo,
      citta,
      cap,
      provincia,
      nazione,
      telefono,
      sito_web
    } = req.body;
    
    // Validazione campi obbligatori
    if (!ragione_sociale || !campo_attivita || !piva || !pec || !sdi || 
        !indirizzo || !citta || !cap || !provincia) {
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori' });
    }
    
    const companyData = {
      ragione_sociale,
      campo_attivita,
      piva,
      codice_fiscale,
      fatturato,
      pec,
      sdi,
      indirizzo,
      citta,
      cap,
      provincia,
      nazione,
      telefono,
      sito_web
    };
    
    const company = await User.upsertCompany(req.user.userId, companyData);
    res.json({
      message: 'Dati aziendali salvati con successo',
      company
    });
  } catch (error) {
    console.error('Errore salvataggio dati aziendali:', error);
    
    if (error.code === '23505') { // Violazione unique constraint
      if (error.constraint === 'companies_piva_key') {
        return res.status(400).json({ error: 'PIVA già registrata' });
      }
      if (error.constraint === 'companies_pec_key') {
        return res.status(400).json({ error: 'PEC già registrata' });
      }
    }
    
    res.status(500).json({ error: 'Errore durante il salvataggio dei dati aziendali' });
  }
};

// Elimina company
exports.deleteCompany = async (req, res) => {
  try {
    const company = await User.getCompany(req.user.userId);
    
    if (!company) {
      return res.status(404).json({ error: 'Dati aziendali non trovati' });
    }
    
    await Company.delete(company.id);
    res.json({ message: 'Dati aziendali eliminati con successo' });
  } catch (error) {
    console.error('Errore eliminazione dati aziendali:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dei dati aziendali' });
  }
};