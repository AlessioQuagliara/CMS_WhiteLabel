const express = require('express');
const {
  getAllEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  registerToEvent,
  cancelRegistration,
  getEventRegistrations,
  updateRegistrationStatus,
  markAttendance,
  getUserRegistrations
} = require('../controllers/eventController');
const { authenticateToken } = require('../middleware/userAuth');
const { authenticateAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// Route pubbliche
router.get('/', getAllEvents);
router.get('/:id', getEvent);

// Route protette per utenti
router.use(authenticateToken);
router.post('/:eventId/register', registerToEvent);
router.delete('/:eventId/cancel', cancelRegistration);
router.get('/user/registrations', getUserRegistrations);

// Route protette per admin
router.post('/', authenticateAdmin, createEvent);
router.put('/:id', authenticateAdmin, updateEvent);
router.delete('/:id', authenticateAdmin, deleteEvent);
router.get('/:eventId/registrations', authenticateAdmin, getEventRegistrations);
router.put('/registrations/:registrationId/status', authenticateAdmin, updateRegistrationStatus);
router.put('/registrations/:registrationId/attendance', authenticateAdmin, markAttendance);

module.exports = router;