/**
 * Email Service — SendGrid integration
 * Handles all transactional and alert emails
 */

const sgMail = require('@sendgrid/mail');

// Only init if key is set
if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'SG.your-sendgrid-key-here') {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'alerts@workbridge.ai',
  name:  process.env.SENDGRID_FROM_NAME  || 'WorkBridge AI'
};

// ─── Send alert confirmation email ────────────────────
async function sendAlertConfirmation({ email, query, frequency, alertId }) {
  if (!isSendGridConfigured()) {
    console.log(`[Email] Confirmation would be sent to ${email} for query: "${query}"`);
    return;
  }

  const unsubUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?id=${alertId}`;

  const html = buildEmailTemplate({
    preheader: `Your job alert for "${query}" is active`,
    title: '🔔 Alert Activated!',
    body: `
      <p style="font-size:16px;color:#f0efe8;margin:0 0 16px">You'll receive <strong style="color:#f0a500">${frequency}</strong> alerts whenever new listings match:</p>
      <div style="background:#1c1f27;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:16px 20px;margin:0 0 20px">
        <p style="font-family:'Courier New',monospace;font-size:18px;color:#f0a500;margin:0;font-weight:700">"${escHtml(query)}"</p>
      </div>
      <p style="font-size:14px;color:#9a9a8e;margin:0 0 24px">We'll search across full-time jobs, government tenders, freelance gigs, and internships worldwide.</p>
    `,
    cta: { text: 'Search Now', url: process.env.FRONTEND_URL || 'http://localhost:3000' },
    footer: `<a href="${unsubUrl}" style="color:#5a5a52;font-size:12px">Unsubscribe from this alert</a>`
  });

  await sgMail.send({
    to: email,
    from: FROM,
    subject: `✅ Alert set — "${query}" · WorkBridge AI`,
    html,
    text: `Your job alert for "${query}" is active. You'll receive ${frequency} emails. Unsubscribe: ${unsubUrl}`
  });
}

// ─── Send job alert digest email ──────────────────────
async function sendJobAlertDigest({ email, query, frequency, listings, alertId }) {
  if (!isSendGridConfigured()) {
    console.log(`[Email] Digest would be sent to ${email}: ${listings.length} listings for "${query}"`);
    return;
  }

  if (!listings || listings.length === 0) return;

  const unsubUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?id=${alertId}`;
  const searchUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}?q=${encodeURIComponent(query)}`;

  const typeColors = {
    job:        { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e',  label: 'Full-time' },
    tender:     { bg: 'rgba(167,139,250,0.15)',text: '#a78bfa',  label: 'Tender'    },
    freelance:  { bg: 'rgba(56,189,248,0.15)', text: '#38bdf8',  label: 'Freelance' },
    internship: { bg: 'rgba(240,165,0,0.15)',  text: '#f0a500',  label: 'Internship'}
  };

  const listingCards = listings.slice(0, 8).map(job => {
    const tc = typeColors[job.type] || typeColors.job;
    const logo = job.company.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `
    <div style="background:#1c1f27;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px;margin-bottom:12px;">
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:12px">
        <div style="width:40px;height:40px;border-radius:8px;background:${job.color||'#1e3a5f'};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;font-family:'Georgia',serif">${logo}</div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:#f0efe8;margin-bottom:2px">${escHtml(job.title)}</div>
          <div style="font-size:12px;color:#9a9a8e">${escHtml(job.company)} · ${escHtml(job.location)}</div>
        </div>
        <span style="background:${tc.bg};color:${tc.text};font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 9px;border-radius:6px;white-space:nowrap">${tc.label}</span>
      </div>
      <p style="font-size:13px;color:#9a9a8e;margin:0 0 12px;line-height:1.6">${escHtml(job.description.slice(0, 180))}…</p>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07)">
        <span style="font-size:15px;font-weight:800;color:#f0a500">${escHtml(job.salary)}</span>
        <span style="font-size:11px;color:#5a5a52">${escHtml(job.posted)} · ${escHtml(job.source)}</span>
      </div>
    </div>`;
  }).join('');

  const freqLabel = { instant: 'New listing', daily: 'Daily digest', weekly: 'Weekly digest' }[frequency] || 'Alert';

  const html = buildEmailTemplate({
    preheader: `${listings.length} new listing${listings.length>1?'s':''} found for "${query}"`,
    title: `${freqLabel}: ${listings.length} new listing${listings.length>1?'s':''}`,
    body: `
      <p style="font-size:15px;color:#9a9a8e;margin:0 0 20px">New listings matching <strong style="color:#f0a500">"${escHtml(query)}"</strong>:</p>
      ${listingCards}
      ${listings.length > 8 ? `<p style="text-align:center;font-size:13px;color:#5a5a52;margin:8px 0 0">+${listings.length-8} more listings on WorkBridge AI</p>` : ''}
    `,
    cta: { text: `View All ${listings.length} Listings →`, url: searchUrl },
    footer: `<a href="${unsubUrl}" style="color:#5a5a52;font-size:12px">Unsubscribe · Manage alerts</a>`
  });

  await sgMail.send({
    to: email,
    from: FROM,
    subject: `🔔 ${listings.length} new ${query} listing${listings.length>1?'s':''} · WorkBridge AI`,
    html,
    text: `${listings.length} new listings for "${query}". View them at ${searchUrl}. Unsubscribe: ${unsubUrl}`
  });
}

// ─── Email HTML template builder ──────────────────────
function buildEmailTemplate({ preheader, title, body, cta, footer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0c0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <!-- Preheader -->
  <span style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escHtml(preheader)}</span>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0c0f;padding:40px 20px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

          <!-- Logo header -->
          <tr>
            <td style="padding:0 0 28px">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f0a500;border-radius:6px;padding:4px 10px">
                    <span style="font-size:11px;font-weight:700;color:#000;letter-spacing:1px;text-transform:uppercase">AI</span>
                  </td>
                  <td style="padding-left:10px">
                    <span style="font-size:20px;font-weight:800;color:#f0efe8;letter-spacing:-0.5px">WorkBridge</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#13151a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px 32px 24px">

              <!-- Title -->
              <h1 style="font-size:24px;font-weight:800;color:#f0efe8;margin:0 0 20px;letter-spacing:-0.5px;line-height:1.2">${escHtml(title)}</h1>

              <!-- Body content -->
              ${body}

              <!-- CTA button -->
              ${cta ? `
              <div style="text-align:center;margin:24px 0 8px">
                <a href="${cta.url}" style="display:inline-block;background:#f0a500;color:#000;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;letter-spacing:0.3px">${escHtml(cta.text)}</a>
              </div>` : ''}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0 0;text-align:center">
              ${footer || ''}
              <p style="font-size:11px;color:#3a3a3a;margin:8px 0 0">WorkBridge AI · Global Job &amp; Tender Search · <a href="${process.env.FRONTEND_URL||'#'}" style="color:#3a3a3a">workbridge.ai</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────
function isSendGridConfigured() {
  return process.env.SENDGRID_API_KEY &&
    process.env.SENDGRID_API_KEY !== 'SG.your-sendgrid-key-here';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = { sendAlertConfirmation, sendJobAlertDigest };
