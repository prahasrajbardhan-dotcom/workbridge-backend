/**
 * WorkBridge AI — Main Server
 * Express API server for job search, saved jobs, and email alerts
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const searchRoutes = require('./routes/search');
const alertRoutes = require('./routes/alerts');
const savedRoutes = require('./routes/saved');
const { startAlertCron } = require('./services/alertCron');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security middleware ───────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ─── CORS ─────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Body parsing ──────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Global rate limiting ──────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait a few minutes before trying again.',
    retryAfter: '15 minutes'
  }
});
app.use('/api/', globalLimiter);

// Stricter limiter for AI search (it's expensive)
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 10,                    // 10 searches per minute
  message: { error: 'Search rate limit exceeded. Please wait 1 minute.' }
});

// ─── Routes ───────────────────────────────────────────
app.use('/api/search', searchLimiter, searchRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/saved', savedRoutes);

// ─── Health check ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WorkBridge AI Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ─── 404 handler ──────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ─── Error handler ────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  WorkBridge AI backend running on http://localhost:${PORT}`);
  console.log(`📋  Health check: http://localhost:${PORT}/health`);
  console.log(`🔍  Search API:   http://localhost:${PORT}/api/search`);
  console.log(`🔔  Alerts API:   http://localhost:${PORT}/api/alerts`);
  console.log(`💾  Saved API:    http://localhost:${PORT}/api/saved`);
  console.log(`\n🌍  Environment: ${process.env.NODE_ENV || 'development'}\n`);

  // Start scheduled email alert cron job
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'SG.your-sendgrid-key-here') {
    startAlertCron();
    console.log(`⏰  Alert cron started: ${process.env.ALERT_CRON_SCHEDULE || '0 8 * * *'}\n`);
  } else {
    console.log(`⚠️  SendGrid not configured — email alerts disabled\n`);
  }
});

module.exports = app;
