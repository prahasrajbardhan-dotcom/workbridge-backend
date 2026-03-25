/**
 * /api/saved
 * Saved jobs management (server-side persistence)
 * 
 * Uses session-based ID passed from frontend.
 * In production: link to user accounts with JWT auth.
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');

const router = express.Router();

// In-memory store keyed by sessionId
// In production: use PostgreSQL/MongoDB
const savedStore = new Map(); // sessionId -> Map(jobId -> job)

function getUserSaved(sessionId) {
  if (!savedStore.has(sessionId)) savedStore.set(sessionId, new Map());
  return savedStore.get(sessionId);
}

// ─── GET /api/saved/:sessionId ───────────────────────
router.get('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId || sessionId.length > 100) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const saved = getUserSaved(sessionId);
  res.json({
    success: true,
    count: saved.size,
    jobs: Array.from(saved.values())
  });
});

// ─── POST /api/saved/:sessionId ──────────────────────
router.post('/:sessionId', [
  body('job').notEmpty().withMessage('Job object is required'),
  body('job.id').notEmpty().isString()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { sessionId } = req.params;
  const { job } = req.body;

  if (!sessionId || sessionId.length > 100) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const saved = getUserSaved(sessionId);

  if (saved.size >= 200) {
    return res.status(400).json({ error: 'Saved jobs limit reached (200 max)' });
  }

  saved.set(job.id, {
    ...job,
    savedAt: new Date().toISOString()
  });

  res.status(201).json({
    success: true,
    message: 'Job saved',
    jobId: job.id,
    count: saved.size
  });
});

// ─── DELETE /api/saved/:sessionId/:jobId ─────────────
router.delete('/:sessionId/:jobId', (req, res) => {
  const { sessionId, jobId } = req.params;

  if (!sessionId || sessionId.length > 100) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const saved = getUserSaved(sessionId);

  if (!saved.has(jobId)) {
    return res.status(404).json({ error: 'Saved job not found' });
  }

  saved.delete(jobId);

  res.json({
    success: true,
    message: 'Job removed from saved',
    jobId,
    count: saved.size
  });
});

// ─── DELETE /api/saved/:sessionId ────────────────────
// Clear all saved jobs
router.delete('/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  savedStore.delete(sessionId);

  res.json({ success: true, message: 'All saved jobs cleared' });
});

module.exports = router;
