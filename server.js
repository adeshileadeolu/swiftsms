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

// ── TRUST RAILWAY'S PROXY — must be first, fixes rate-limit + CORS ───────────
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────────────────
const rawOrigin = process.env.FRONTEND_URL || '';
const allowedOrigins = [
  ...rawOrigin.split(',').map(o => o.trim().replace(/\/$/, '')),
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(clean)) return callback(null, true);
    console.warn(`CORS blocked: ${origin}`);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Raw body for BTCPay webhook ───────────────────────────────────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// ── JSON body parser ──────────────────────────────────────────────────────────
app.use(express.json());

// ── Rate limiters ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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
  time: new Date().toISOString(),
  db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
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
