// ─── services/sms.js — Smart Routing Engine ──────────────────────────────────
const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');

// Twilio client (singleton)
const getTwilioClient = () => twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Vonage client (singleton)
const getVonageClient = () => new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

// ── Route decision — returns 'twilio' or 'vonage' based on number prefix ─────
// Twilio is primary for US, CA, UK, AU, NZ, and Western Europe
const TWILIO_PREFIXES = [
  '+1',   // US, Canada
  '+44',  // UK
  '+61',  // Australia
  '+64',  // New Zealand
  '+33',  // France
  '+49',  // Germany
  '+34',  // Spain
  '+39',  // Italy
  '+31',  // Netherlands
  '+32',  // Belgium
  '+41',  // Switzerland
  '+46',  // Sweden
  '+47',  // Norway
  '+45',  // Denmark
  '+358', // Finland
  '+353', // Ireland
  '+43',  // Austria
  '+351', // Portugal
];

const getRoute = (phoneNumber) => {
  return TWILIO_PREFIXES.some(p => phoneNumber.startsWith(p)) ? 'twilio' : 'vonage';
};

// ── Pricing per SMS ──────────────────────────────────────────────────────────
const getPriceUSD = (phoneNumber) => {
  if (phoneNumber.startsWith('+1')) return parseFloat(process.env.PRICE_US_CA_AU) || 0.015;
  if (phoneNumber.startsWith('+61') || phoneNumber.startsWith('+64')) return parseFloat(process.env.PRICE_US_CA_AU) || 0.015;
  if (TWILIO_PREFIXES.some(p => phoneNumber.startsWith(p))) return parseFloat(process.env.PRICE_UK_EU) || 0.020;
  return parseFloat(process.env.PRICE_GLOBAL) || 0.025;
};

// ── Send via Twilio ──────────────────────────────────────────────────────────
const sendViaTwilio = async (to, body) => {
  const client = getTwilioClient();
  const message = await client.messages.create({
    to,
    from: process.env.TWILIO_FROM_NUMBER,
    body,
  });
  return { provider: 'twilio', sid: message.sid, status: message.status };
};

// ── Send via Vonage ──────────────────────────────────────────────────────────
const sendViaVonage = async (to, body) => {
  const vonage = getVonageClient();
  // Vonage requires number without the + prefix
  const toFormatted = to.replace('+', '');
  const result = await vonage.sms.send({
    to: toFormatted,
    from: process.env.VONAGE_FROM,
    text: body,
  });
  const msg = result.messages[0];
  if (msg.status !== '0') {
    throw new Error(`Vonage error: ${msg['error-text']}`);
  }
  return { provider: 'vonage', messageId: msg['message-id'], status: 'sent' };
};

// ── Main send function with automatic failover ────────────────────────────────
const sendSMS = async (to, body) => {
  const primary = getRoute(to);
  const fallback = primary === 'twilio' ? 'vonage' : 'twilio';
  const log = { number: to, usedFailover: false };

  try {
    // Try primary provider
    const result = primary === 'twilio'
      ? await sendViaTwilio(to, body)
      : await sendViaVonage(to, body);
    return { ...log, ...result, provider: primary };
  } catch (primaryError) {
    console.warn(`Primary (${primary}) failed for ${to}: ${primaryError.message}. Trying ${fallback}...`);

    try {
      // Automatic failover to secondary
      const result = fallback === 'twilio'
        ? await sendViaTwilio(to, body)
        : await sendViaVonage(to, body);
      return { ...log, ...result, provider: fallback, usedFailover: true };
    } catch (fallbackError) {
      throw new Error(`Both providers failed. Primary: ${primaryError.message} | Fallback: ${fallbackError.message}`);
    }
  }
};

// ── Send bulk with per-number cost calculation ────────────────────────────────
const sendBulk = async (recipients, message, onProgress) => {
  const results = [];
  let totalCost = 0;

  for (let i = 0; i < recipients.length; i++) {
    const number = recipients[i];
    try {
      const result = await sendSMS(number, message);
      const cost = getPriceUSD(number);
      totalCost += cost;
      results.push({ number, success: true, cost, ...result });
      if (onProgress) onProgress({ index: i, total: recipients.length, number, success: true, provider: result.provider });
    } catch (err) {
      results.push({ number, success: false, error: err.message, cost: 0 });
      if (onProgress) onProgress({ index: i, total: recipients.length, number, success: false, error: err.message });
    }

    // Small delay between sends to respect rate limits
    if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 100));
  }

  return { results, totalCost };
};

// ── Calculate cost estimate before sending ────────────────────────────────────
const estimateCost = (recipients) => {
  return recipients.reduce((sum, num) => sum + getPriceUSD(num), 0);
};

module.exports = { sendSMS, sendBulk, getRoute, getPriceUSD, estimateCost };
