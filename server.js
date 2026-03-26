/**
 * WorkBridge AI — Backend Server
 * Powered by Groq AI (free) — visitors never need an API key
 */

require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const searchRoutes = require('./routes/search');
const alertRoutes  = require('./routes/alerts');
const savedRoutes  = require('./routes/saved');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allow your Netlify frontend
const allowed = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please wait a few minutes.' }
}));

app.use('/api/search', rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Search rate limit — please wait 1 minute.' }
}), searchRoutes);

app.use('/api/alerts', alertRoutes);
app.use('/api/saved',  savedRoutes);

// Health check
app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'WorkBridge AI Backend',
  version: '2.0.0',
  ai: 'Groq (free)',
  timestamp: new Date().toISOString()
}));

app.use('*', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n✅  WorkBridge AI running on http://localhost:${PORT}`);
  console.log(`⚡  AI: Groq (free) — ${GROQ_MODEL || 'llama-3.3-70b-versatile'}`);
  console.log(`🌍  Frontend: ${process.env.FRONTEND_URL || 'not set'}\n`);
});

const GROQ_MODEL = 'llama-3.3-70b-versatile';
module.exports = app;
