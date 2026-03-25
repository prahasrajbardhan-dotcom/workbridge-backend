/**
 * /api/search
 * Handles AI-powered job search using Anthropic Claude API
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Validation rules ──────────────────────────────────
const searchValidation = [
  body('query')
    .trim()
    .notEmpty().withMessage('Search query is required')
    .isLength({ min: 2, max: 500 }).withMessage('Query must be between 2 and 500 characters'),
  body('types')
    .optional()
    .isArray().withMessage('types must be an array')
    .custom(arr => arr.every(t => ['job','tender','freelance','internship'].includes(t)))
    .withMessage('Invalid listing type'),
  body('region').optional().isString().isLength({ max: 100 }),
  body('industry').optional().isString().isLength({ max: 100 }),
  body('experience').optional().isString().isLength({ max: 100 }),
  body('mode').optional().isIn(['Remote','Hybrid','On-site','']),
  body('salaryMin').optional().isNumeric(),
  body('salaryMax').optional().isNumeric(),
  body('count').optional().isInt({ min: 5, max: 20 })
];

// ─── POST /api/search ─────────────────────────────────
router.post('/', searchValidation, async (req, res, next) => {
  // Validate inputs
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    query: searchQuery,
    types = ['job','tender','freelance','internship'],
    region = '',
    industry = '',
    experience = '',
    mode = '',
    salaryMin = '',
    salaryMax = '',
    count = 10
  } = req.body;

  // Build context string for the AI
  const contextParts = [
    types.length < 4 ? `Listing types: ${types.join(', ')}` : 'All listing types',
    region     ? `Region/Location: ${region}`         : 'Global (worldwide)',
    industry   ? `Industry: ${industry}`               : '',
    experience ? `Experience level: ${experience}`     : '',
    mode       ? `Work mode: ${mode}`                  : '',
    (salaryMin || salaryMax)
      ? `Salary range: $${salaryMin || 0}–${salaryMax || 'unlimited'}`
      : ''
  ].filter(Boolean).join(' | ');

  const systemPrompt = `You are WorkBridge AI, a global job, tender, freelance, and internship search engine API.
You ONLY respond with valid JSON arrays — no markdown, no code fences, no explanation, no text before or after the array.
Your listings must be realistic, diverse, globally accurate, and highly relevant to the search.`;

  const userPrompt = `Search query: "${searchQuery}"
Filters: ${contextParts}

Generate exactly ${count} highly realistic job listings as a JSON array.

Requirements:
- Include a MIX of these listing types: ${types.join(', ')}
- Be GLOBALLY DIVERSE: vary countries (USA, UK, India, Canada, Australia, Europe, Middle East, Singapore, Remote)
- Use REAL-sounding company names, departments, and government bodies
- Salaries must be SPECIFIC and region-accurate (not "competitive"):
  * USA jobs: $80,000–$200,000/yr
  * UK jobs: £35,000–£120,000/yr or £200–£600/day
  * India jobs: ₹4–₹50 LPA
  * Middle East: $60,000–$150,000/yr tax-free
  * Freelance: hourly ($25–$200/hr) or project ($500–$50,000)
  * Tenders: project value (₹50L–₹500Cr or $100K–$50M)
- For TENDERS: use real government dept names (CPWD, NHAI, NHS, DOT, etc.), realistic deadlines
- For FREELANCE: Upwork/Toptal/direct client style briefs
- 2–3 listings should have urgent:true
- Tags should be actual skills/technologies/certifications

Return ONLY this JSON array (no wrapper object):
[
  {
    "id": "wb-[unique 8 char alphanumeric]",
    "type": "job|tender|freelance|internship",
    "title": "specific job title",
    "company": "company or government department name",
    "location": "City, Country",
    "region": "USA|UK|India|Europe|Middle East|Canada|Australia|SEA|Remote",
    "salary": "formatted local currency salary string",
    "salaryNum": numeric_USD_equivalent,
    "description": "2-3 sentence description with specific requirements and responsibilities",
    "tags": ["skill1","skill2","skill3","skill4","skill5"],
    "posted": "X days/hours ago",
    "deadline": "Month DD, YYYY or null",
    "source": "LinkedIn|Indeed|Glassdoor|GeM Portal|Upwork|Toptal|GovHQ|TenderTiger|CPPP",
    "mode": "Remote|On-site|Hybrid",
    "urgent": true_or_false,
    "color": "#hexcolor for company logo background"
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const rawText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    // Extract JSON array from response
    const arrayStart = rawText.indexOf('[');
    const arrayEnd = rawText.lastIndexOf(']');

    if (arrayStart === -1 || arrayEnd === -1) {
      throw new Error('AI response did not contain a valid JSON array');
    }

    const jsonString = rawText.slice(arrayStart, arrayEnd + 1);
    const listings = JSON.parse(jsonString);

    if (!Array.isArray(listings)) {
      throw new Error('AI response was not an array');
    }

    // Sanitize each listing
    const sanitized = listings.map(item => ({
      id:          String(item.id || `wb-${Math.random().toString(36).slice(2,10)}`),
      type:        ['job','tender','freelance','internship'].includes(item.type) ? item.type : 'job',
      title:       String(item.title || '').slice(0, 200),
      company:     String(item.company || '').slice(0, 200),
      location:    String(item.location || '').slice(0, 200),
      region:      String(item.region || 'Global').slice(0, 100),
      salary:      String(item.salary || 'Competitive').slice(0, 100),
      salaryNum:   Number(item.salaryNum) || 0,
      description: String(item.description || '').slice(0, 1000),
      tags:        Array.isArray(item.tags) ? item.tags.slice(0, 8).map(t => String(t).slice(0, 50)) : [],
      posted:      String(item.posted || 'Recently').slice(0, 50),
      deadline:    item.deadline ? String(item.deadline).slice(0, 50) : null,
      source:      String(item.source || 'WorkBridge').slice(0, 100),
      mode:        ['Remote','On-site','Hybrid'].includes(item.mode) ? item.mode : 'On-site',
      urgent:      Boolean(item.urgent),
      color:       /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : '#1e3a5f'
    }));

    res.json({
      success: true,
      query: searchQuery,
      filters: { types, region, industry, experience, mode, salaryMin, salaryMax },
      count: sanitized.length,
      listings: sanitized,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return res.status(err.status || 500).json({
        error: 'AI service error',
        message: err.message,
        code: err.status
      });
    }
    if (err instanceof SyntaxError) {
      return res.status(500).json({
        error: 'AI returned malformed data',
        message: 'Please try your search again'
      });
    }
    next(err);
  }
});

// ─── POST /api/search/insight ─────────────────────────
// Separate endpoint for the AI market insight panel
router.post('/insight', [
  body('query').trim().notEmpty().isLength({ max: 500 }),
  body('listingCount').optional().isInt({ min: 0, max: 50 }),
  body('listingTypes').optional().isArray()
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { query: searchQuery, listingCount = 0, listingTypes = [], context = '' } = req.body;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are a job market analyst AI. Write exactly 2 sentences of actionable market insight for someone searching: "${searchQuery}".
Context: Found ${listingCount} listings (types: ${listingTypes.join(', ')}). ${context}
Mention: current demand level, realistic salary expectation, or one specific tip to improve their application.
Be direct, specific, and professional. No fluff or generic statements.`
      }]
    });

    const insight = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    res.json({ success: true, insight });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
