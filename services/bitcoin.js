// ─── services/bitcoin.js ──────────────────────────────────────────────────────
const axios  = require('axios');
const crypto = require('crypto');

const btcpay = () => {
  const url = process.env.BTCPAY_URL;
  const key = process.env.BTCPAY_API_KEY;
  const sid = process.env.BTCPAY_STORE_ID;
  if (!url) throw new Error('BTCPAY_URL is not set in Railway Variables');
  if (!key) throw new Error('BTCPAY_API_KEY is not set in Railway Variables');
  if (!sid) throw new Error('BTCPAY_STORE_ID is not set in Railway Variables');
  return axios.create({
    baseURL: `${url}/api/v1`,
    headers: { 'Authorization': `token ${key}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
};

const createInvoice = async ({ amountUSD, userId, userEmail, orderId }) => {
  try {
    const client      = btcpay();
    const storeId     = process.env.BTCPAY_STORE_ID;
    const frontendUrl = process.env.FRONTEND_URL || '';

    // Step 1 — Create the invoice
    const res = await client.post(`/stores/${storeId}/invoices`, {
      amount:   amountUSD.toFixed(2),
      currency: 'USD',
      metadata: { orderId, userId: userId.toString(), buyerEmail: userEmail },
      checkout: {
        speedPolicy:           'MediumSpeed',
        expirationMinutes:     30,
        redirectURL:           frontendUrl ? `${frontendUrl}?wallet=success` : undefined,
        redirectAutomatically: !!frontendUrl,
      },
    });

    const inv = res.data;
    console.log('✓ BTCPay invoice created:', inv.id, '| status:', inv.status);
    console.log('  Raw expirationTime:', inv.expirationTime, typeof inv.expirationTime);
    console.log('  Raw addresses:', JSON.stringify(inv.addresses));

    // Step 2 — Fetch payment methods to get the BTC address
    // BTCPay populates addresses in payment methods, not always in the invoice object
    let btcAddress = null;
    let btcAmount  = null;
    try {
      const pmRes = await client.get(`/stores/${storeId}/invoices/${inv.id}/payment-methods`);
      const methods = pmRes.data;
      console.log('  Payment methods:', JSON.stringify(methods));
      const btcMethod = methods.find(m =>
        m.paymentMethodId?.toLowerCase().includes('btc') ||
        m.cryptoCode?.toLowerCase() === 'btc'
      );
      if (btcMethod) {
        btcAddress = btcMethod.destination || btcMethod.address || null;
        btcAmount  = btcMethod.amount || btcMethod.due || null;
        console.log('  BTC address from payment methods:', btcAddress);
        console.log('  BTC amount from payment methods:', btcAmount);
      }
    } catch (pmErr) {
      console.warn('  Could not fetch payment methods:', pmErr.message);
    }

    // Fallback: try addresses from invoice object
    if (!btcAddress && inv.addresses) {
      btcAddress = inv.addresses.BTC || inv.addresses.btc || Object.values(inv.addresses)[0] || null;
    }

    // Step 3 — Fix expiry time
    // BTCPay expirationTime is Unix seconds (e.g. 1718000000)
    // JavaScript Date needs milliseconds, so multiply by 1000
    let expiresAt;
    const rawExp = inv.expirationTime;
    if (rawExp) {
      // If it's already in ms range (>1e12) use as-is, otherwise multiply
      expiresAt = rawExp > 1e12 ? new Date(rawExp) : new Date(rawExp * 1000);
    } else {
      // Fallback: 30 minutes from now
      expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    }
    console.log('  Parsed expiresAt:', expiresAt.toISOString());

    return {
      invoiceId:   inv.id,
      checkoutUrl: inv.checkoutLink,
      btcAmount:   btcAmount || inv.amount,
      btcAddress,
      expiresAt:   expiresAt.toISOString(),
      status:      inv.status,
    };
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.response?.data || err.message;
    console.error('BTCPay createInvoice error:', status, message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')
      throw new Error(`Cannot reach BTCPay at ${process.env.BTCPAY_URL}. Check BTCPAY_URL.`);
    if (status === 401 || status === 403)
      throw new Error('BTCPay API key rejected. Check BTCPAY_API_KEY.');
    if (status === 404)
      throw new Error('BTCPay store not found. Check BTCPAY_STORE_ID.');
    throw new Error(`BTCPay error: ${message}`);
  }
};

const getInvoiceStatus = async (invoiceId) => {
  try {
    const client  = btcpay();
    const storeId = process.env.BTCPAY_STORE_ID;
    const res     = await client.get(`/stores/${storeId}/invoices/${invoiceId}`);
    const inv     = res.data;
    return {
      status:    inv.status,
      isPaid:    inv.status === 'Settled',
      isExpired: inv.status === 'Expired',
    };
  } catch (err) {
    throw new Error(`Could not fetch invoice status: ${err.message}`);
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
