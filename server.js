// ─── SwiftSMS Backend — server.js ────────────────────────────────────────────
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose  = require('mongoose');

const authRoutes    = require('./routes/auth');
const smsRoutes     = require('./routes/sms');
const walletRoutes  = require('./routes/wallet');
const clientRoutes  = require('./routes/clients');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// ── Trust Railway proxy — MUST be first ──────────────────────────────────────
app.set('trust proxy', 1);

// ── CORS — open to all origins ────────────────────────────────────────────────
// Security comes from JWT tokens, not origin restrictions.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Helmet (relax policies that conflict with open CORS) ──────────────────────
app.use(helmet({
  crossOriginResourcePolicy:  false,
  crossOriginOpenerPolicy:    false,
  crossOriginEmbedderPolicy:  false,
}));

// ── Raw body for BTCPay webhook (must be before JSON parser) ──────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ── JSON body parser ──────────────────────────────────────────────────────────
app.use(express.json());

// ── Rate limiters ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/sms',     smsRoutes);
app.use('/api/wallet',  walletRoutes);
app.use('/api/clients', clientRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  time:   new Date().toISOString(),
  db:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
}));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✓ MongoDB connected');
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`✓ SwiftSMS backend running on port ${PORT}`));
  })
  .catch(err => {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  });