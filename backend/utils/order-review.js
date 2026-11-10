const mongoose = require('mongoose');
const Order = require('../models/Order');
const Review = require('../models/Review');

async function saveOrderReviews(order, rows) {
  const session = await mongoose.startSession();
  let saved;
  try {
    await session.withTransaction(async () => {
      const claimed = await Order.findOneAndUpdate(
        { _id: order._id, status: 'Hoàn thành', reviewedAt: null },
        { $set: { reviewedAt: new Date() } }, { session, new: true }
      );
      if (!claimed || await Review.exists({ orderId: order._id, isDemo: { $ne: true } }).session(session)) {
        throw Object.assign(new Error('Đơn hàng này đã được đánh giá hoặc chưa hoàn thành.'), { status: 409 });
      }
      saved = await Review.insertMany(rows, { session });
    });
    return saved;
  } finally { await session.endSession(); }
}

async function withReviewState(orders) {
  const ids = await Review.distinct('orderId', { orderId: { $in: orders.map(order => order._id) }, isDemo: { $ne: true } });
  const reviewed = new Set(ids.map(String));
  return orders.map(order => ({ ...order.toObject(), hasReviewed: !!order.reviewedAt || reviewed.has(String(order._id)) }));
}
module.exports = { saveOrderReviews, withReviewState };
