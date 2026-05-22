// ─── routes/clients.js ───────────────────────────────────────────────────────
const router = require('express').Router();
const { authenticate, requireOwner } = require('../middleware/auth');
const { User, Transaction } = require('../models');

router.use(authenticate, requireOwner);

router.get('/', async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' }).sort({ createdAt: -1 }).select('-password');
    res.json({ clients });
  } catch { res.status(500).json({ error: 'Could not fetch clients' }); }
});

router.get('/stats', async (req, res) => {
  try {
    const totalClients   = await User.countDocuments({ role: 'client' });
    const transactions   = await Transaction.find({ type: 'credit', btcStatus: 'paid' });
    const totalRevenue   = transactions.reduce((s,t)=>s+t.amount, 0);
    res.json({ totalClients, totalRevenue });
  } catch { res.status(500).json({ error: 'Could not fetch stats' }); }
});

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, company, email, balance } = req.body;
    if (!firstName || !email) return res.status(400).json({ error: 'Name and email required' });
    const user = await User.create({
      firstName, lastName, company, email, balance: balance||0,
      password: Math.random().toString(36).slice(-10)+'A1!',
      role: 'client', agreedToTos: true, tosAgreedAt: new Date(), isEmailVerified: true,
    });
    res.status(201).json({ client: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.code===11000 ? 'Email already exists' : 'Could not create client' });
  }
});

router.patch('/:id/topup', async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    const client = await User.findByIdAndUpdate(req.params.id, { $inc: { balance: amount } }, { new: true });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    await Transaction.create({ userId: client._id, type: 'credit', amount, description: reason||'Manual credit by owner', btcStatus: 'paid', btcConfirmedAt: new Date() });
    res.json({ message: `$${amount} credited`, balance: client.balance });
  } catch { res.status(500).json({ error: 'Could not credit client' }); }
});

router.patch('/:id/suspend', async (req, res) => {
  try {
    const { isActive } = req.body;
    const client = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: `Client ${isActive?'reactivated':'suspended'}` });
  } catch { res.status(500).json({ error: 'Could not update client' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Client removed' });
  } catch { res.status(500).json({ error: 'Could not remove client' }); }
});

module.exports = router;