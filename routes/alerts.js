/**
 * /api/alerts — Email alert subscriptions
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Simple in-memory store
const alertStore = new Map();

// POST /api/alerts — create alert
router.post('/', [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('query').trim().notEmpty().isLength({ min: 2, max: 300 }),
  body('frequency').optional().isIn(['instant','daily','weekly'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, query, frequency = 'daily', filters = {} } = req.body;
  const alertId = uuidv4();

  alertStore.set(alertId, {
    id: alertId, email, query, frequency, filters,
    active: true,
    createdAt: new Date().toISOString()
  });

  console.log(`[Alert] Created: ${email} → "${query}" (${frequency})`);

  res.status(201).json({
    success: true,
    message: `Alert set! You'll receive ${frequency} emails for "${query}"`,
    alertId
  });
});

// GET /api/alerts/:email
router.get('/:email', (req, res) => {
  const { email } = req.params;
  const userAlerts = Array.from(alertStore.values()).filter(a => a.email === email);
  res.json({ success: true, email, alerts: userAlerts });
});

// DELETE /api/alerts/:alertId
router.delete('/:alertId', (req, res) => {
  const { alertId } = req.params;
  if (!alertStore.has(alertId)) return res.status(404).json({ error: 'Alert not found' });
  alertStore.delete(alertId);
  res.json({ success: true, message: 'Alert deleted' });
});

module.exports = router;
module.exports.alertStore = alertStore;
