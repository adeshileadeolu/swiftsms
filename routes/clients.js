// ─── routes/clients.js — Owner-only Client Management ────────────────────────
const router = require('express').Router();
const { authenticate, requireOwner } = require('../middleware/auth');
const { User, Campaign, Transaction } = require('../models');

router.use(authenticate, requireOwner);

// GET /api/clients — list all clients
router.get('/', async (req, res) => {
  try {
    const clients = await User
      .find({ role: 'client' })
      .sort({ createdAt: -1 })
      .select('-password');
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch clients' });
  }
});

// GET /api/clients/stats — owner dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [totalClients, totalCampaigns, transactions] = await Promise.all([
      User.countDocuments({ role: 'client' }),
      Campaign.countDocuments({ status: 'completed' }),
      Transaction.find({ type: 'credit', btcStatus: 'paid' }),
    ]);
    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    res.json({ totalClients, totalCampaigns, totalRevenue });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stats' });
  }
});

// PATCH /api/clients/:id/topup — manually credit a client's balance
router.patch('/:id/topup', async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

    const client = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { balance: amount } },
      { new: true }
    );
    if (!client) return res.status(404).json({ error: 'Client not found' });

    await Transaction.create({
      userId:      client._id,
      type:        'credit',
      amount,
      description: reason || `Manual credit by owner`,
      btcStatus:   'paid',
      btcConfirmedAt: new Date(),
    });

    res.json({ message: `$${amount} credited to ${client.email}`, balance: client.balance });
  } catch (err) {
    res.status(500).json({ error: 'Could not credit client' });
  }
});

// PATCH /api/clients/:id/suspend — suspend or reactivate a client
router.patch('/:id/suspend', async (req, res) => {
  try {
    const { isActive } = req.body;
    const client = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: `Client ${isActive ? 'reactivated' : 'suspended'}`, client });
  } catch (err) {
    res.status(500).json({ error: 'Could not update client status' });
  }
});

// DELETE /api/clients/:id — remove client
router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Client removed' });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove client' });
  }
});

module.exports = router;
