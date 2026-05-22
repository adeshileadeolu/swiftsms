// ─── services/bitcoin.js ──────────────────────────────────────────────────────
const axios  = require('axios');
const crypto = require('crypto');

const btcpay = () => axios.create({
  baseURL: `${process.env.BTCPAY_URL}/api/v1`,
  headers: { 'Authorization': `token ${process.env.BTCPAY_API_KEY}`, 'Content-Type': 'application/json' },
  timeout: 15000,
});

const createInvoice = async ({ amountUSD, userId, userEmail, orderId }) => {
  const res = await btcpay().post(`/stores/${process.env.BTCPAY_STORE_ID}/invoices`, {
    amount: amountUSD.toFixed(2),
    currency: 'USD',
    metadata: { orderId, userId: userId.toString(), buyerEmail: userEmail },
    checkout: {
      speedPolicy: 'MediumSpeed',
      expirationMinutes: 30,
      redirectURL: `${process.env.FRONTEND_URL}?wallet=success`,
      redirectAutomatically: true,
    },
  });
  const inv = res.data;
  return {
    invoiceId:   inv.id,
    checkoutUrl: inv.checkoutLink,
    btcAmount:   inv.amount,
    btcAddress:  inv.addresses?.BTC,
    expiresAt:   inv.expirationTime,
    status:      inv.status,
  };
};

const getInvoiceStatus = async (invoiceId) => {
  const res = await btcpay().get(`/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`);
  const inv = res.data;
  return { status: inv.status, isPaid: inv.status === 'Settled', isExpired: inv.status === 'Expired' };
};

const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', process.env.BTCPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(signatureHeader.replace('sha256=',''),'hex'));
  } catch { return false; }
};

module.exports = { createInvoice, getInvoiceStatus, verifyWebhookSignature };