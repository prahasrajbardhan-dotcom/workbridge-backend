// Email service placeholder
// Connect SendGrid here when ready
async function sendAlertConfirmation({ email, query, frequency }) {
  console.log(`[Email] Alert confirmation would be sent to ${email} for: "${query}" (${frequency})`);
}
async function sendJobAlertDigest({ email, query, listings }) {
  console.log(`[Email] Digest would be sent to ${email}: ${listings.length} listings for "${query}"`);
}
module.exports = { sendAlertConfirmation, sendJobAlertDigest };
