// ─── routes/webhooks.js — BTCPay Server Webhook Handler ──────────────────────
// BTCPay calls this endpoint when an invoice status changes.
// This is the AUTHORITATIVE payment confirmation — more reliable than polling.
const router = require('express').Router();
const { verifyWebhookSignature, mapStatus } = require('../services/bitcoin');
const { User, Transaction } = require('../models');

// POST /webhooks/btcpay
router.post('/btcpay', async (req, res) => {
  try {
    const signature = req.headers['btcpay-sig'];

    // Verify the webhook came from YOUR BTCPay server
    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('BTCPay webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    const { type, invoiceId } = event;

    // We only care about settlement events
    if (type !== 'InvoiceSettled' && type !== 'InvoicePaymentSettled') {
      return res.json({ received: true });
    }

    // Find the pending transaction for this invoice
    const txn = await Transaction.findOne({
      btcInvoiceId: invoiceId,
      btcStatus:    'pending',
    });

    if (!txn) {
      // Already processed or unknown — idempotent response
      return res.json({ received: true, note: 'Invoice already processed' });
    }

    // Credit user's wallet
    await User.findByIdAndUpdate(txn.userId, {
      $inc: { balance: txn.amount }
    });

    // Mark transaction confirmed
    txn.btcStatus = 'paid';
    txn.btcConfirmedAt = new Date();
    await txn.save();

    console.log(`✓ BTC payment confirmed: $${txn.amount} credited to user ${txn.userId}`);
    res.json({ received: true });

  } catch (err) {
    console.error('BTCPay webhook error:', err);
    // Always return 200 to BTCPay so it doesn't retry unnecessarily
    res.json({ received: true });
  }
});

module.exports = router;
