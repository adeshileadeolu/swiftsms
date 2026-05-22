// ─── routes/sms.js ───────────────────────────────────────────────────────────
const router    = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { User, Campaign, Transaction } = require('../models');
const { sendBulk, estimateCost, getRoute } = require('../services/sms');

router.use(authenticate);

const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  keyGenerator: (req) => req.user._id.toString(),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many campaigns sent this hour.' },
});

// POST /api/sms/estimate
router.post('/estimate', async (req, res) => {
  try {
    const { recipients } = req.body;
    if (!Array.isArray(recipients) || !recipients.length)
      return res.status(400).json({ error: 'Recipients array required' });
    const cost = estimateCost(recipients);
    const breakdown = recipients.reduce((acc, num) => {
      const p = getRoute(num); acc[p] = (acc[p]||0)+1; return acc;
    }, {});
    res.json({ recipientCount: recipients.length, estimatedCost: parseFloat(cost.toFixed(4)), userBalance: req.user.balance, canAfford: req.user.balance >= cost, routeBreakdown: breakdown });
  } catch { res.status(500).json({ error: 'Could not estimate cost' }); }
});

// POST /api/sms/send
router.post('/send', sendLimiter, async (req, res) => {
  try {
    const { campaignName, message, recipients } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
    if (!Array.isArray(recipients) || !recipients.length) return res.status(400).json({ error: 'At least one recipient required' });
    if (recipients.length > 10000) return res.status(400).json({ error: 'Maximum 10,000 recipients per campaign' });

    const cost = estimateCost(recipients);
    const user = await User.findById(req.user._id);
    if (user.balance < cost)
      return res.status(402).json({ error: 'Insufficient balance', required: cost.toFixed(4), available: user.balance.toFixed(4) });

    user.balance   -= cost;
    user.totalSent += recipients.length;
    user.totalCamps++;
    await user.save();

    const campaign = await Campaign.create({
      userId: user._id, name: campaignName || `Campaign ${new Date().toLocaleDateString()}`,
      message, recipients, totalCount: recipients.length, status: 'sending',
    });

    await Transaction.create({
      userId: user._id, type: 'debit', amount: cost,
      description: `${campaign.name} — ${recipients.length} recipients`, reference: campaign._id.toString(),
      btcStatus: 'paid',
    });

    res.json({ campaignId: campaign._id, message: 'Campaign started', estimatedCost: cost.toFixed(4), recipients: recipients.length });

    // Send async
    const { results, totalCost } = await sendBulk(recipients, message);
    const sentCount   = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    if (cost > totalCost) {
      await User.findByIdAndUpdate(user._id, { $inc: { balance: cost - totalCost } });
    }

    await Campaign.findByIdAndUpdate(campaign._id, {
      sentCount, failedCount, cost: totalCost, status: failedCount === recipients.length ? 'failed' : 'completed',
      routeBreakdown: { twilio: results.filter(r=>r.provider==='twilio').length, vonage: results.filter(r=>r.provider==='vonage').length },
      logs: results.map(r => ({ number: r.number, provider: r.provider||'unknown', status: r.success?'sent':'failed', error: r.error||null })),
    });
  } catch (err) {
    console.error('Send error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Campaign failed to start' });
  }
});

// GET /api/sms/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100).select('-logs -recipients');
    res.json({ campaigns });
  } catch { res.status(500).json({ error: 'Could not fetch campaigns' }); }
});

// GET /api/sms/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch { res.status(500).json({ error: 'Could not fetch campaign' }); }
});

module.exports = router;