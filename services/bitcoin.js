// ─── services/bitcoin.js — BTCPay Server Integration ─────────────────────────
// Uses BTCPay Server Greenfield API v1
// Docs: https://docs.btcpayserver.org/API/Greenfield/v1/
const axios = require('axios');
const crypto = require('crypto');

const btcpay = axios.create({
  baseURL: `${process.env.BTCPAY_URL}/api/v1`,
  headers: {
    'Authorization': `token ${process.env.BTCPAY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ── Create a Bitcoin invoice for a given USD amount ───────────────────────────
// Returns the invoice object with a payment URL and BTC address
const createInvoice = async ({ amountUSD, userId, userEmail, orderId }) => {
  try {
    const response = await btcpay.post(`/stores/${process.env.BTCPAY_STORE_ID}/invoices`, {
      amount: amountUSD.toFixed(2),
      currency: 'USD',                        // BTCPay converts USD → BTC at current rate
      metadata: {
        orderId,
        userId: userId.toString(),
        buyerEmail: userEmail,
        itemDesc: `SwiftSMS Wallet Top-Up — $${amountUSD.toFixed(2)} USD`,
      },
      checkout: {
        speedPolicy: 'MediumSpeed',           // 1 confirmation required
        expirationMinutes: 30,                // Invoice expires in 30 minutes
        redirectURL: `${process.env.FRONTEND_URL}/wallet?status=success`,
        redirectAutomatically: true,
      },
      receipt: {
        enabled: true,
        showPayments: true,
      },
    });

    const invoice = response.data;
    return {
      invoiceId:    invoice.id,
      checkoutUrl:  invoice.checkoutLink,    // Redirect user here to pay
      btcAmount:    invoice.amount,          // BTC amount (after conversion)
      btcAddress:   invoice.addresses?.BTC,  // On-chain BTC address
      expiresAt:    invoice.expirationTime,
      status:       invoice.status,
    };
  } catch (err) {
    console.error('BTCPay create invoice error:', err.response?.data || err.message);
    throw new Error('Could not create Bitcoin invoice. Check BTCPay configuration.');
  }
};

// ── Fetch invoice status from BTCPay ─────────────────────────────────────────
const getInvoiceStatus = async (invoiceId) => {
  try {
    const response = await btcpay.get(`/stores/${process.env.BTCPAY_STORE_ID}/invoices/${invoiceId}`);
    const invoice = response.data;
    // BTCPay statuses: New, Processing, Expired, Invalid, Settled
    return {
      status: invoice.status,
      isPaid: invoice.status === 'Settled',
      isExpired: invoice.status === 'Expired',
    };
  } catch (err) {
    console.error('BTCPay get invoice error:', err.response?.data || err.message);
    throw new Error('Could not fetch invoice status');
  }
};

// ── Verify BTCPay webhook signature ──────────────────────────────────────────
// BTCPay signs webhooks with HMAC-SHA256 using your webhook secret
const verifyWebhookSignature = (rawBody, signatureHeader) => {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', process.env.BTCPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signatureHeader.replace('sha256=', ''), 'hex')
  );
};

// ── Map BTCPay invoice status to our internal status ─────────────────────────
const mapStatus = (btcpayStatus) => {
  const map = {
    'New':        'pending',
    'Processing': 'pending',
    'Settled':    'paid',
    'Expired':    'expired',
    'Invalid':    'invalid',
  };
  return map[btcpayStatus] || 'pending';
};

module.exports = { createInvoice, getInvoiceStatus, verifyWebhookSignature, mapStatus };
