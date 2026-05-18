// ─── SwiftSMS Backend — server.js ────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const authRoutes    = require('./routes/auth');
const smsRoutes     = require('./routes/sms');
const walletRoutes  = require('./routes/wallet');
const clientRoutes  = require('./routes/clients');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// ── Trust Railway/cloud proxy — MUST be first line ───────────────────────────
app.set('trust proxy', 1);

// ── CORS — wide open for now, locks down after confirmed working ──────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// ── Helmet — relax for debugging ─────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// ── Raw body for BTCPay webhook ───────────────────────────────────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ── JSON body parser ──────────────────────────────────────────────────────────
app.use(express.json());

// ── Rate limiters ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/sms',     smsRoutes);
app.use('/api/wallet',  walletRoutes);
app.use('/api/clients', clientRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    frontend_url: process.env.FRONTEND_URL || 'not set',
    node_env: process.env.NODE_ENV || 'not set',
  });
});

// ── Debug route — shows what origin Railway sees ──────────────────────────────
app.get('/debug', (req, res) => {
  res.json({
    origin:  req.headers.origin || 'no origin header',
    host:    req.headers.host,
    ip:      req.ip,
    forward: req.headers['x-forwarded-for'] || 'none',
  });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
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
