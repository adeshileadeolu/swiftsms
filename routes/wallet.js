// ─── routes/wallet.js ────────────────────────────────────────────────────────
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { User, Transaction } = require('../models');
const { createInvoice, getInvoiceStatus } = require('../services/bitcoin');

router.use(authenticate);

router.get('/balance', async (req, res) => {
  res.json({ balance: req.user.balance });
});

router.get('/transactions', async (req, res) => {
  try {
    const txns = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ transactions: txns });
  } catch { res.status(500).json({ error: 'Could not fetch transactions' }); }
});

router.post('/topup/bitcoin', async (req, res) => {
  try {
    const { amountUSD } = req.body;
    if (!amountUSD || amountUSD < 5)  return res.status(400).json({ error: 'Minimum top-up is $5.00 USD' });
    if (amountUSD > 10000) return res.status(400).json({ error: 'Maximum single top-up is $10,000 USD' });

    const orderId = uuid();
    const invoice = await createInvoice({ amountUSD, userId: req.user._id, userEmail: req.user.email, orderId });

    await Transaction.create({
      userId: req.user._id, type: 'credit', amount: amountUSD,
      description: `Bitcoin wallet top-up — $${amountUSD.toFixed(2)} USD`,
      reference: orderId, btcInvoiceId: invoice.invoiceId,
      btcAmount: invoice.btcAmount, btcAddress: invoice.btcAddress, btcStatus: 'pending',
    });

    res.json({ invoiceId: invoice.invoiceId, checkoutUrl: invoice.checkoutUrl, btcAmount: invoice.btcAmount, btcAddress: invoice.btcAddress, amountUSD, expiresAt: invoice.expiresAt });
  } catch (err) {
    console.error('BTC topup error:', err.message);
    res.status(500).json({ error: err.message || 'Could not create invoice' });
  }
});

router.get('/topup/status/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { isPaid, isExpired } = await getInvoiceStatus(invoiceId);

    if (isPaid) {
      const txn = await Transaction.findOne({ userId: req.user._id, btcInvoiceId: invoiceId, btcStatus: 'pending' });
      if (txn) {
        await User.findByIdAndUpdate(req.user._id, { $inc: { balance: txn.amount } });
        txn.btcStatus = 'paid'; txn.btcConfirmedAt = new Date();
        await txn.save();
        return res.json({ status: 'paid', credited: txn.amount, message: `$${txn.amount.toFixed(2)} added to your wallet.` });
      }
    }
    res.json({ status: isExpired ? 'expired' : 'pending', message: isExpired ? 'Invoice expired.' : 'Awaiting payment...' });
  } catch (err) {
    console.error('Invoice status error:', err.message);
    res.status(500).json({ error: 'Could not check invoice status' });
  }
});

module.exports = router;