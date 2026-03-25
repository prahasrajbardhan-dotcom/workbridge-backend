# WorkBridge AI — Full Stack Setup Guide

A production-ready AI job, tender, freelance & internship search platform.
**Stack:** Node.js + Express · Anthropic Claude · SendGrid · Railway/Render

---

## Project Structure

```
workbridge-backend/
├── server.js                  ← Main entry point
├── package.json
├── .env.example               ← Copy to .env and fill in keys
│
├── routes/
│   ├── search.js              ← POST /api/search  (AI search)
│   │                            POST /api/search/insight
│   ├── alerts.js              ← POST /api/alerts  (create alert)
│   │                            GET  /api/alerts/:email
│   │                            DELETE /api/alerts/:alertId
│   └── saved.js               ← GET/POST/DELETE /api/saved/:sessionId
│
├── services/
│   ├── emailService.js        ← SendGrid email templates
│   └── alertCron.js           ← Scheduled alert cron jobs
│
├── middleware/
│   └── errorHandler.js        ← Global error handler
│
└── public/
    └── index.html             ← Frontend (connect to this backend)
```

---

## Quick Start (Local Development)

### 1. Install dependencies
```bash
cd workbridge-backend
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `SENDGRID_API_KEY` — from https://sendgrid.com (free tier works)
- `SENDGRID_FROM_EMAIL` — a verified sender email in your SendGrid account

### 3. Start the server
```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs on: http://localhost:3001
Health check:   http://localhost:3001/health

### 4. Open the frontend
Open `public/index.html` in your browser, or serve it with VS Code Live Server.
The `API_BASE` in the HTML is already set to `http://localhost:3001/api`.

---

## API Reference

### Search
```
POST /api/search
Content-Type: application/json

{
  "query": "Senior React developer remote",
  "types": ["job", "tender", "freelance", "internship"],
  "region": "USA",
  "industry": "Technology",
  "experience": "3–6 years",
  "mode": "Remote",
  "salaryMin": "80000",
  "salaryMax": "200000",
  "count": 10
}
```

### AI Market Insight
```
POST /api/search/insight
{ "query": "...", "listingCount": 10, "listingTypes": ["job"] }
```

### Create Email Alert
```
POST /api/alerts
{
  "email": "user@example.com",
  "query": "Python developer remote",
  "frequency": "daily",
  "filters": { "types": ["job"], "region": "USA" }
}
```

### Get Alerts for Email
```
GET /api/alerts/user@example.com
```

### Delete Alert
```
DELETE /api/alerts/:alertId
```

### Save a Job (server-side)
```
POST /api/saved/:sessionId
{ "job": { ...jobObject } }
```

### Get Saved Jobs
```
GET /api/saved/:sessionId
```

---

## Deploy to Railway (Recommended — Free Tier Available)

Railway is the easiest way to deploy this backend.

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/workbridge-ai
git push -u origin main
```

### 2. Deploy on Railway
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Select your repository
3. Railway auto-detects Node.js and runs `npm start`

### 3. Set environment variables on Railway
Go to your project → Variables tab → Add:
```
ANTHROPIC_API_KEY=sk-ant-...
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=alerts@yourdomain.com
SENDGRID_FROM_NAME=WorkBridge AI
NODE_ENV=production
FRONTEND_URL=https://your-frontend.netlify.app
```

### 4. Get your backend URL
Railway gives you a URL like `https://workbridge-production-abc123.railway.app`

### 5. Update frontend
In `public/index.html`, change the first `<script>` block:
```js
const API_BASE = 'https://workbridge-production-abc123.railway.app/api';
```

---

## Deploy Frontend to Netlify

1. Go to https://netlify.com → Add New Site → Deploy Manually
2. Drag and drop the `public/` folder
3. Done — your site is live at `https://random-name.netlify.app`
4. Set a custom domain in Netlify if you have one

---

## Alternative: Deploy Both on Render

### Backend
1. New Web Service → Connect GitHub repo
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables

### Frontend
1. New Static Site → Connect same GitHub repo
2. Publish directory: `public`
3. Done

---

## Setting Up SendGrid (Email Alerts)

1. Sign up free at https://sendgrid.com
2. Go to Settings → API Keys → Create API Key (Full Access)
3. Copy the key to `SENDGRID_API_KEY` in `.env`
4. Go to Settings → Sender Authentication
5. Verify a single sender email (your email works fine for testing)
6. Set `SENDGRID_FROM_EMAIL` to that verified address

**Free tier:** 100 emails/day forever — more than enough to start.

---

## Production Upgrade: Add a Real Database

The current version uses in-memory storage (alerts & saved jobs reset on restart).
For production persistence, add PostgreSQL:

```bash
npm install pg
```

Replace the in-memory Maps in `routes/alerts.js` and `routes/saved.js` with:
```js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create tables
await pool.query(`
  CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    frequency VARCHAR(20) DEFAULT 'daily',
    filters JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ,
    sent_count INT DEFAULT 0
  )
`);
```

Railway and Render both offer free PostgreSQL add-ons.

---

## Customize

### Change AI model
In `routes/search.js` and `services/alertCron.js`, change:
```js
model: 'claude-sonnet-4-20250514'
// to:
model: 'claude-opus-4-6' // More powerful, slower
```

### Adjust rate limits
In `server.js`:
```js
max: 50,           // requests per window
windowMs: 900000   // 15 minutes
```

### Change alert schedule
In `.env`:
```
ALERT_CRON_SCHEDULE=0 8 * * *    # Daily at 8am UTC
ALERT_CRON_SCHEDULE=0 */4 * * *  # Every 4 hours
ALERT_CRON_SCHEDULE=0 9 * * 1    # Weekly Monday 9am
```

---

## Architecture Overview

```
User Browser (index.html)
       │
       ▼ POST /api/search
┌─────────────────────────┐
│   Node.js + Express     │
│   (Railway/Render)      │
│                         │
│  ┌──────────────────┐   │
│  │  /routes/search  │   │ ──▶ Anthropic Claude API
│  │  /routes/alerts  │   │        (AI job generation)
│  │  /routes/saved   │   │
│  └──────────────────┘   │
│                         │
│  ┌──────────────────┐   │
│  │  alertCron.js    │   │ ──▶ SendGrid
│  │  (node-cron)     │   │        (email digests)
│  └──────────────────┘   │
└─────────────────────────┘
```

---

Built with ❤️ · WorkBridge AI
