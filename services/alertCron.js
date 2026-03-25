/**
 * Alert Cron Service
 * Runs scheduled AI searches for each active alert subscriber
 * and sends digest emails via SendGrid
 */

const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const { sendJobAlertDigest } = require('./emailService');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Import alertStore from the alerts route
// (in production this would be a DB query)
let alertStoreRef = null;

function startAlertCron() {
  // Lazy-load the alert store to avoid circular require
  const alertsRouter = require('../routes/alerts');
  alertStoreRef = alertsRouter.alertStore;

  const schedule = process.env.ALERT_CRON_SCHEDULE || '0 8 * * *'; // Default: 8am UTC daily

  cron.schedule(schedule, async () => {
    console.log(`\n[Cron] Alert job started at ${new Date().toISOString()}`);
    await processAlerts('daily');
  });

  // Also run hourly for "instant" alerts
  cron.schedule('0 * * * *', async () => {
    console.log(`\n[Cron] Instant alert check at ${new Date().toISOString()}`);
    await processAlerts('instant');
  });

  // Weekly alerts — every Monday at 9am UTC
  cron.schedule('0 9 * * 1', async () => {
    console.log(`\n[Cron] Weekly alert job at ${new Date().toISOString()}`);
    await processAlerts('weekly');
  });

  console.log(`✅ Alert cron scheduled: ${schedule}`);
}

async function processAlerts(frequency) {
  if (!alertStoreRef) return;

  const activeAlerts = Array.from(alertStoreRef.values()).filter(
    a => a.active && a.frequency === frequency
  );

  if (activeAlerts.length === 0) {
    console.log(`[Cron] No active ${frequency} alerts to process`);
    return;
  }

  console.log(`[Cron] Processing ${activeAlerts.length} ${frequency} alerts`);

  // Process in batches of 5 to avoid API rate limits
  const batchSize = 5;
  for (let i = 0; i < activeAlerts.length; i += batchSize) {
    const batch = activeAlerts.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(alert => processOneAlert(alert)));
    if (i + batchSize < activeAlerts.length) {
      await sleep(2000); // Wait 2s between batches
    }
  }

  console.log(`[Cron] Finished processing ${frequency} alerts`);
}

async function processOneAlert(alert) {
  try {
    console.log(`[Cron] Searching for: "${alert.query}" → ${alert.email}`);

    // Run AI search for this alert's query
    const listings = await runSearchForAlert(alert);

    if (!listings || listings.length === 0) {
      console.log(`[Cron] No results for "${alert.query}", skipping email`);
      return;
    }

    // Send digest email
    await sendJobAlertDigest({
      email:     alert.email,
      query:     alert.query,
      frequency: alert.frequency,
      listings,
      alertId:   alert.id
    });

    // Update last sent timestamp
    alert.lastSentAt = new Date().toISOString();
    alert.sentCount  = (alert.sentCount || 0) + 1;
    alertStoreRef.set(alert.id, alert);

    console.log(`[Cron] ✅ Sent ${listings.length} listings to ${alert.email}`);

  } catch (err) {
    console.error(`[Cron] ❌ Failed for alert ${alert.id}:`, err.message);
  }
}

async function runSearchForAlert(alert) {
  const { query, filters = {} } = alert;
  const types = filters.types || ['job','tender','freelance','internship'];

  const ctx = [
    `Types: ${types.join(', ')}`,
    filters.region   ? `Region: ${filters.region}`     : 'Global',
    filters.industry ? `Industry: ${filters.industry}` : ''
  ].filter(Boolean).join(' | ');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: 'You are a job search API. Respond ONLY with a valid JSON array. No markdown, no text.',
    messages: [{
      role: 'user',
      content: `Search: "${query}" | Context: ${ctx}
Generate 6 realistic, globally diverse job listings as JSON array.
Each item: { id, type, title, company, location, salary, salaryNum, description, tags, posted, deadline, source, mode, urgent, color }
Types to include: ${types.join(', ')}. Return ONLY the JSON array.`
    }]
  });

  const raw = message.content.filter(b => b.type==='text').map(b => b.text).join('');
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  if (s < 0) return [];
  return JSON.parse(raw.slice(s, e+1));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { startAlertCron, processAlerts };
