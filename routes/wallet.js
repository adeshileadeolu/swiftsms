// ─── routes/wallet.js ────────────────────────────────────────────────────────
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { User, Transaction } = require('../models');
const { createInvoice, getInvoiceStatus } = require('../services/bitcoin');

// All wallet routes require authentication
router.use(authenticate);

// GET /api/wallet/balance
router.get('/balance', async (req, res) => {
  try {
    res.json({ balance: req.user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch balance' });
  }
});

// GET /api/wallet/transactions
router.get('/transactions', async (req, res) => {
  try {
    const txns = await Transaction
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ transactions: txns });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch transactions' });
  }
});

// POST /api/wallet/topup/bitcoin — Create a BTC invoice for wallet top-up
router.post('/topup/bitcoin', async (req, res) => {
  try {
    const { amountUSD } = req.body;

    if (!amountUSD || amountUSD < 5) {
      return res.status(400).json({ error: 'Minimum top-up is $5.00 USD' });
    }
    if (amountUSD > 10000) {
      return res.status(400).json({ error: 'Maximum single top-up is $10,000 USD' });
    }

    const orderId = uuid();

    // Create invoice on BTCPay Server
    const invoice = await createInvoice({
      amountUSD,
      userId:    req.user._id,
      userEmail: req.user.email,
      orderId,
    });

    // Create a pending transaction record
    await Transaction.create({
      userId:      req.user._id,
      type:        'credit',
      amount:      amountUSD,
      description: `Bitcoin wallet top-up — $${amountUSD.toFixed(2)} USD`,
      reference:   orderId,
      btcInvoiceId: invoice.invoiceId,
      btcAmount:   invoice.btcAmount,
      btcAddress:  invoice.btcAddress,
      btcStatus:   'pending',
    });

    res.json({
      invoiceId:   invoice.invoiceId,
      checkoutUrl: invoice.checkoutUrl,   // Frontend redirects user here
      btcAmount:   invoice.btcAmount,
      btcAddress:  invoice.btcAddress,
      amountUSD,
      expiresAt:   invoice.expiresAt,
      message:     'Bitcoin invoice created. Complete payment within 30 minutes.',
    });
  } catch (err) {
    console.error('Bitcoin topup error:', err);
    res.status(500).json({ error: err.message || 'Could not create invoice' });
  }
});

// GET /api/wallet/topup/status/:invoiceId — Poll invoice status
router.get('/topup/status/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get current status from BTCPay
    const { status, isPaid, isExpired } = await getInvoiceStatus(invoiceId);

    if (isPaid) {
      // Find the pending transaction and credit the user
      const txn = await Transaction.findOne({
        userId:       req.user._id,
        btcInvoiceId: invoiceId,
        btcStatus:    'pending',
      });

      if (txn) {
        // Credit user balance and mark transaction confirmed
        await User.findByIdAndUpdate(req.user._id, {
          $inc: { balance: txn.amount }
        });
        txn.btcStatus = 'paid';
        txn.btcConfirmedAt = new Date();
        await txn.save();

        return res.json({
          status: 'paid',
          credited: txn.amount,
          message: `$${txn.amount.toFixed(2)} has been added to your wallet.`,
        });
      }
    }

    res.json({
      status: isExpired ? 'expired' : status.toLowerCase(),
      message: isExpired
        ? 'Invoice expired. Please create a new top-up request.'
        : 'Payment pending confirmation on the blockchain.',
    });
  } catch (err) {
    console.error('Invoice status check error:', err);
    res.status(500).json({ error: 'Could not check invoice status' });
  }
});

module.exports = router;
