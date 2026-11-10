const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: { type: Number, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  isDemo: { type: Boolean, default: false },
  seedBatch: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userName: { type: String, default: 'Khách' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

reviewSchema.index({ productId: 1 });

module.exports = mongoose.model('Review', reviewSchema);
