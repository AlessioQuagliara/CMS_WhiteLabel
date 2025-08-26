const express = require('express');
const { getCompany, upsertCompany, deleteCompany } = require('../controllers/companyController');
const { authenticateToken } = require('../middleware/userAuth');

const router = express.Router();

// Tutte le route richiedono autenticazione
router.use(authenticateToken);

// Ottieni dati aziendali
router.get('/', getCompany);

// Crea o aggiorna dati aziendali
router.post('/', upsertCompany);

// Elimina dati aziendali
router.delete('/', deleteCompany);

module.exports = router;