// ─── services/bitcoin.js ──────────────────────────────────────────────────────
const axios  = require('axios');
const crypto = require('crypto');

const btcpay = () => {
  const url = process.env.BTCPAY_URL;
  const key = process.env.BTCPAY_API_KEY;
  const sid = process.env.BTCPAY_STORE_ID;

  // Surface missing config clearly in Railway logs
  if (!url) throw new Error('BTCPAY_URL is not set in Railway Variables');
  if (!key) throw new Error('BTCPAY_API_KEY is not set in Railway Variables');
  if (!sid) throw new Error('BTCPAY_STORE_ID is not set in Railway Variables');

  return axios.create({
    baseURL: `${url}/api/v1`,
    headers: {
      'Authorization': `token ${key}`,
      'Content-Type':  'application/json',
    },
    timeout: 20000,
  });
};

const createInvoice = async ({ amountUSD, userId, userEmail, orderId }) => {
  try {
    const client = btcpay();
    const storeId = process.env.BTCPAY_STORE_ID;
    const frontendUrl = process.env.FRONTEND_URL || '';

    const res = await client.post(`/stores/${storeId}/invoices`, {
      amount:   amountUSD.toFixed(2),
      currency: 'USD',
      metadata: {
        orderId,
        userId:     userId.toString(),
        buyerEmail: userEmail,
        itemDesc:   `SwiftSMS Wallet Top-Up — $${amountUSD.toFixed(2)} USD`,
      },
      checkout: {
        speedPolicy:          'MediumSpeed',
        expirationMinutes:    30,
        redirectURL:          frontendUrl ? `${frontendUrl}?wallet=success` : undefined,
        redirectAutomatically: !!frontendUrl,
      },
    });

    const inv = res.data;
    console.log('✓ BTCPay invoice created:', inv.id);

    return {
      invoiceId:   inv.id,
      checkoutUrl: inv.checkoutLink,
      btcAmount:   inv.amount,
      btcAddress:  inv.addresses?.BTC || null,
      expiresAt:   inv.expirationTime,
      status:      inv.status,
    };
  } catch (err) {
    // Detailed error for Railway logs
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.response?.data || err.message;
    console.error('BTCPay createInvoice error:', status, message);

    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
      throw new Error(`Cannot reach BTCPay server at ${process.env.BTCPAY_URL}. Check BTCPAY_URL in Railway Variables.`);
    if (status === 401 || status === 403)
      throw new Error('BTCPay API key rejected. Check BTCPAY_API_KEY in Railway Variables.');
    if (status === 404)
      throw new Error('BTCPay store not found. Check BTCPAY_STORE_ID in Railway Variables.');

    throw new Error(`BTCPay error: ${message}`);
  }
};

const getInvoiceStatus = async (invoiceId) => {
  try {
    const client  = btcpay();
    const storeId = process.env.BTCPAY_STORE_ID;
    const res = await client.get(`/stores/${storeId}/invoices/${invoiceId}`);
    const inv = res.data;
    return {
      status:    inv.status,
      isPaid:    inv.status === 'Settled',
      isExpired: inv.status === 'Expired',
    };
  } catch (err) {
    const message = err.response?.data?.message || err.message;
    throw new Error(`Could not fetch invoice status: ${message}`);
  }
};

const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!signatureHeader || !process.env.BTCPAY_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', process.env.BTCPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signatureHeader.replace('sha256=', ''), 'hex')
    );
  } catch { return false; }
};

module.exports = { createInvoice, getInvoiceStatus, verifyWebhookSignature };
