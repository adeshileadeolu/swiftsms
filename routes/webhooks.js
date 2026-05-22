// ─── routes/webhooks.js ───────────────────────────────────────────────────────
const router = require('express').Router();
const { verifyWebhookSignature } = require('../services/bitcoin');
const { User, Transaction } = require('../models');

router.post('/btcpay', async (req, res) => {
  try {
    const signature = req.headers['btcpay-sig'];
    if (!verifyWebhookSignature(req.body, signature)) {
      console.warn('BTCPay webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    if (event.type !== 'InvoiceSettled' && event.type !== 'InvoicePaymentSettled')
      return res.json({ received: true });

    const txn = await Transaction.findOne({ btcInvoiceId: event.invoiceId, btcStatus: 'pending' });
    if (!txn) return res.json({ received: true, note: 'Already processed' });

    await User.findByIdAndUpdate(txn.userId, { $inc: { balance: txn.amount } });
    txn.btcStatus = 'paid'; txn.btcConfirmedAt = new Date();
    await txn.save();

    console.log(`✓ BTC payment confirmed: $${txn.amount} → user ${txn.userId}`);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.json({ received: true }); // Always 200 to BTCPay
  }
});

module.exports = router;