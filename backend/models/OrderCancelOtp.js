const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  phone: { type: String, required: true },
  digest: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  ready: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false }
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('OrderCancelOtp', schema);
