/**
 * /api/alerts
 * Email alert subscription management
 * 
 * In production, replace in-memory store with a real database:
 * - PostgreSQL (recommended): use pg or Prisma
 * - MongoDB: use mongoose
 * - Redis: for fast key-value storage
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { sendAlertConfirmation } = require('../services/emailService');

const router = express.Router();

// ─── In-memory store (replace with DB in production) ──
const alertStore = new Map();

// ─── POST /api/alerts ─────────────────────────────────
// Create a new email alert subscription
router.post('/', [
  body('email')
    .trim().notEmpty().isEmail().normalizeEmail()
    .withMessage('Valid email address is required'),
  body('query')
    .trim().notEmpty().isLength({ min: 2, max: 300 })
    .withMessage('Search query is required'),
  body('frequency')
    .optional()
    .isIn(['instant','daily','weekly'])
    .withMessage('Frequency must be instant, daily, or weekly'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    email,
    query,
    frequency = 'daily',
    filters = {}
  } = req.body;

  // Check if this email already has an alert for this query
  const existingKey = `${email}::${query.toLowerCase().trim()}`;
  for (const [id, alert] of alertStore.entries()) {
    if (`${alert.email}::${alert.query.toLowerCase().trim()}` === existingKey) {
      return res.status(409).json({
        error: 'Alert already exists',
        message: 'You already have an alert set up for this search.',
        alertId: id
      });
    }
  }

  const alertId = uuidv4();
  const now = new Date().toISOString();

  const alert = {
    id: alertId,
    email,
    query,
    frequency,
    filters: {
      types:      filters.types      || ['job','tender','freelance','internship'],
      region:     filters.region     || '',
      industry:   filters.industry   || '',
      experience: filters.experience || '',
      mode:       filters.mode       || ''
    },
    active: true,
    createdAt: now,
    lastSentAt: null,
    sentCount: 0
  };

  alertStore.set(alertId, alert);

  // Send confirmation email
  try {
    await sendAlertConfirmation({ email, query, frequency, alertId });
  } catch (emailErr) {
    console.error('Alert confirmation email failed:', emailErr.message);
    // Don't fail the request if email fails — alert is still saved
  }

  res.status(201).json({
    success: true,
    message: `Alert set up! You'll receive ${frequency} emails to ${email} when new ${query} listings are posted.`,
    alertId,
    alert: {
      id: alertId,
      email,
      query,
      frequency,
      filters: alert.filters,
      createdAt: now
    }
  });
});

// ─── GET /api/alerts/:email ───────────────────────────
// Get all alerts for an email address
router.get('/:email', [
  param('email').isEmail().normalizeEmail()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.params;
  const userAlerts = [];

  for (const alert of alertStore.values()) {
    if (alert.email === email) {
      userAlerts.push({
        id:        alert.id,
        query:     alert.query,
        frequency: alert.frequency,
        filters:   alert.filters,
        active:    alert.active,
        createdAt: alert.createdAt,
        lastSentAt:alert.lastSentAt,
        sentCount: alert.sentCount
      });
    }
  }

  res.json({
    success: true,
    email,
    count: userAlerts.length,
    alerts: userAlerts
  });
});

// ─── DELETE /api/alerts/:alertId ─────────────────────
// Unsubscribe / delete an alert
router.delete('/:alertId', [
  param('alertId').isUUID().withMessage('Invalid alert ID')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { alertId } = req.params;

  if (!alertStore.has(alertId)) {
    return res.status(404).json({ error: 'Alert not found', alertId });
  }

  alertStore.delete(alertId);

  res.json({
    success: true,
    message: 'Alert unsubscribed successfully',
    alertId
  });
});

// ─── PATCH /api/alerts/:alertId/pause ────────────────
// Pause / resume an alert without deleting it
router.patch('/:alertId/pause', [
  param('alertId').isUUID()
], (req, res) => {
  const { alertId } = req.params;
  const alert = alertStore.get(alertId);

  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  alert.active = !alert.active;
  alertStore.set(alertId, alert);

  res.json({
    success: true,
    alertId,
    active: alert.active,
    message: alert.active ? 'Alert resumed' : 'Alert paused'
  });
});

// Export store so cron job can access it
module.exports = router;
module.exports.alertStore = alertStore;
