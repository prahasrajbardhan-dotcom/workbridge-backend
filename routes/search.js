/**
 * /api/search
 * AI-powered job search using Groq API (free)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function callGroq(systemMsg, userMsg, maxTokens = 4000) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   }
      ]
    })
  });

  if (res.status === 401) throw new Error('Invalid Groq API key on server');
  if (res.status === 429) throw new Error('Rate limit reached — please try again in a moment');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── POST /api/search ──────────────────────────────────
router.post('/', [
  body('query').trim().notEmpty().isLength({ min: 2, max: 500 }),
  body('types').optional().isArray(),
  body('region').optional().isString().isLength({ max: 100 }),
  body('industry').optional().isString().isLength({ max: 100 }),
  body('experience').optional().isString().isLength({ max: 100 }),
  body('mode').optional().isString().isLength({ max: 50 }),
  body('count').optional().isInt({ min: 5, max: 20 })
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    query,
    types = ['job','tender','freelance','internship'],
    region = '', industry = '', experience = '', mode = '',
    count = 10
  } = req.body;

  const ctx = [
    types.length < 4 ? `Types: ${types.join(', ')}` : 'All listing types',
    region      ? `Region: ${region}`        : 'Global',
    industry    ? `Industry: ${industry}`    : '',
    experience  ? `Experience: ${experience}`: '',
    mode        ? `Mode: ${mode}`            : ''
  ].filter(Boolean).join(' | ');

  const systemMsg = `You are WorkBridge AI, a global job search engine API.
You ONLY respond with valid JSON arrays. No markdown. No code fences. No explanation. No text before or after the array.`;

  const userMsg = `Search: "${query}"
Filters: ${ctx}

Generate exactly ${count} realistic global job listings as a JSON array.
- Mix types: ${types.join(', ')}
- Globally diverse: USA, UK, India, Europe, Middle East, Canada, Australia, Remote
- Specific salaries: USA $80k-$200k/yr, UK £40k-£120k/yr, India ₹5-50 LPA, Gulf $60k-$150k/yr
- For tenders: real govt dept names (CPWD, NHAI, NHS), realistic project values
- For freelance: hourly ($25-$150/hr) or project ($500-$30,000)
- 2-3 listings urgent:true

Return ONLY this JSON array:
[{"id":"wb-XXXX","type":"job|tender|freelance|internship","title":"...","company":"...","location":"City, Country","salary":"...","salaryNum":50000,"description":"2-3 sentences","tags":["s1","s2","s3","s4"],"posted":"X days ago","deadline":null,"source":"LinkedIn|Indeed|GeM|Upwork","mode":"Remote|Hybrid|On-site","urgent":false,"color":"#hexcolor"}]`;

  try {
    const raw = await callGroq(systemMsg, userMsg, 4000);
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    if (s < 0) throw new Error('No results returned');
    const listings = JSON.parse(raw.slice(s, e + 1));

    res.json({
      success: true,
      query,
      count: listings.length,
      listings
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/search/insight ──────────────────────────
router.post('/insight', [
  body('query').trim().notEmpty().isLength({ max: 500 }),
  body('listingCount').optional().isInt()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { query, listingCount = 0, context = '' } = req.body;

  try {
    const insight = await callGroq(
      'You are a job market analyst. Write exactly 2 sentences. Be direct and specific.',
      `Market insight for someone searching "${query}". Found ${listingCount} listings. ${context}. Mention salary range or demand level. No generic statements.`,
      120
    );
    res.json({ success: true, insight: insight.trim() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
