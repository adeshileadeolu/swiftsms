// ─── services/sms.js ─────────────────────────────────────────────────────────
const twilio = require('twilio');
const { Vonage } = require('@vonage/server-sdk');

const getTwilio = () => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const getVonage = () => new Vonage({ apiKey: process.env.VONAGE_API_KEY, apiSecret: process.env.VONAGE_API_SECRET });

const TWILIO_PREFIXES = ['+1','+44','+61','+64','+33','+49','+34','+39','+31','+32','+41','+46','+47','+45','+358','+353','+43','+351'];

const getRoute = (num) => TWILIO_PREFIXES.some(p => num.startsWith(p)) ? 'twilio' : 'vonage';

const getPriceUSD = (num) => {
  if (num.startsWith('+1') || num.startsWith('+61') || num.startsWith('+64'))
    return parseFloat(process.env.PRICE_US_CA_AU) || 0.015;
  if (TWILIO_PREFIXES.some(p => num.startsWith(p)))
    return parseFloat(process.env.PRICE_UK_EU) || 0.020;
  return parseFloat(process.env.PRICE_GLOBAL) || 0.025;
};

const sendViaTwilio = async (to, body) => {
  const msg = await getTwilio().messages.create({ to, from: process.env.TWILIO_FROM_NUMBER, body });
  return { provider: 'twilio', sid: msg.sid };
};

const sendViaVonage = async (to, body) => {
  const result = await getVonage().sms.send({ to: to.replace('+',''), from: process.env.VONAGE_FROM, text: body });
  const msg = result.messages[0];
  if (msg.status !== '0') throw new Error(`Vonage: ${msg['error-text']}`);
  return { provider: 'vonage', messageId: msg['message-id'] };
};

const sendSMS = async (to, body) => {
  const primary  = getRoute(to);
  const fallback = primary === 'twilio' ? 'vonage' : 'twilio';
  try {
    return primary === 'twilio' ? await sendViaTwilio(to, body) : await sendViaVonage(to, body);
  } catch (primaryErr) {
    console.warn(`Primary (${primary}) failed for ${to}: ${primaryErr.message}. Trying ${fallback}...`);
    try {
      return fallback === 'twilio' ? await sendViaTwilio(to, body) : await sendViaVonage(to, body);
    } catch (fallbackErr) {
      throw new Error(`Both providers failed. Primary: ${primaryErr.message} | Fallback: ${fallbackErr.message}`);
    }
  }
};

const sendBulk = async (recipients, message) => {
  const results = [];
  let totalCost = 0;
  for (let i = 0; i < recipients.length; i++) {
    const number = recipients[i];
    try {
      const result = await sendSMS(number, message);
      const cost   = getPriceUSD(number);
      totalCost   += cost;
      results.push({ number, success: true, cost, ...result });
    } catch (err) {
      results.push({ number, success: false, error: err.message, cost: 0 });
    }
    if (i < recipients.length - 1) await new Promise(r => setTimeout(r, 100));
  }
  return { results, totalCost };
};

const estimateCost = (recipients) => recipients.reduce((sum, num) => sum + getPriceUSD(num), 0);

module.exports = { sendSMS, sendBulk, getRoute, getPriceUSD, estimateCost };