// ─── models/index.js ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ── USER ──────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  firstName:         { type: String, required: true, trim: true },
  lastName:          { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, minlength: 8 },
  company:           { type: String, trim: true },
  country:           { type: String, trim: true },
  role:              { type: String, enum: ['client', 'owner'], default: 'client' },
  balance:           { type: Number, default: 0, min: 0 },
  totalSent:         { type: Number, default: 0 },
  totalCamps:        { type: Number, default: 0 },
  isActive:          { type: Boolean, default: true },
  isEmailVerified:   { type: Boolean, default: false },
  agreedToTos:       { type: Boolean, required: true },
  tosAgreedAt:       { type: Date },
  // Email verification
  emailVerifyCode:   { type: String },
  emailVerifyExpiry: { type: Date },
  // Password reset
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyCode;
  delete obj.resetToken;
  return obj;
};

// ── CAMPAIGN ──────────────────────────────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, required: true },
  message:     { type: String, required: true },
  recipients:  [{ type: String }],
  totalCount:  { type: Number, default: 0 },
  sentCount:   { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  cost:        { type: Number, default: 0 },
  status:      { type: String, enum: ['pending','sending','completed','failed'], default: 'pending' },
  routeBreakdown: { twilio: { type: Number, default: 0 }, vonage: { type: Number, default: 0 } },
  logs: [{ number: String, provider: String, status: String, error: String, timestamp: { type: Date, default: Date.now } }],
}, { timestamps: true });

// ── TRANSACTION ───────────────────────────────────────────────────────────────
const transactionSchema = new mongoose.Schema({
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:           { type: String, enum: ['credit','debit'], required: true },
  amount:         { type: Number, required: true },
  description:    { type: String, required: true },
  reference:      { type: String },
  btcInvoiceId:   { type: String },
  btcAmount:      { type: Number },
  btcAddress:     { type: String },
  btcStatus:      { type: String, enum: ['pending','paid','expired','invalid'], default: 'pending' },
  btcConfirmedAt: { type: Date },
}, { timestamps: true });

// ── CONTACT LIST ──────────────────────────────────────────────────────────────
const contactListSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:    { type: String, required: true },
  numbers: [{ type: String }],
}, { timestamps: true });

module.exports = {
  User:        mongoose.model('User', userSchema),
  Campaign:    mongoose.model('Campaign', campaignSchema),
  Transaction: mongoose.model('Transaction', transactionSchema),
  ContactList: mongoose.model('ContactList', contactListSchema),
};
