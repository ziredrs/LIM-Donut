const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const optionalAuth = require('../middleware/auth');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const { saveOrderReviews } = require('../utils/order-review');

function purchasedReviewStages(productId) {
  return [
    { $match: { productId: Number(productId), $or: [{ orderId: { $type: 'objectId' } }, { isDemo: true }] } },
    { $lookup: { from: Order.collection.name, localField: 'orderId', foreignField: '_id', as: 'purchase' } },
    { $unwind: { path: '$purchase', preserveNullAndEmptyArrays: true } },
    { $match: { $or: [{ isDemo: true }, { 'purchase.status': 'Hoàn thành', $expr: { $anyElementTrue: { $map: {
      input: { $ifNull: ['$purchase.items', []] }, as: 'item', in: { $eq: [
        { $convert: { input: { $ifNull: ['$$item.productId', { $arrayElemAt: [{ $split: [{ $toString: '$$item.id' }, '_'] }, 0] }] }, to: 'double', onError: null, onNull: null } },
        Number(productId)
      ] }
    } } } }] } },
    { $project: { purchase: 0 } }
  ];
}

// Chỉ tổng hợp đánh giá gắn với sản phẩm của đơn đã hoàn thành.
async function computeSummary(productId) {
  const result = await Review.aggregate([
    ...purchasedReviewStages(productId),
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  if (!result.length) return { avgRating: 0, count: 0 };
  return { avgRating: Math.round(result[0].avg * 10) / 10, count: result[0].count };
}

router.post('/', optionalAuth, async (req, res) => {
  try {
    const entries = Array.isArray(req.body.reviews) ? req.body.reviews : [req.body];
    if (!entries.length || entries.length > 100 || entries.some(entry => !entry || !Number.isInteger(entry.productId) || typeof entry.comment !== 'string' || !entry.comment.trim())) {
      return res.status(400).json({ message: 'Thiếu thông tin đánh giá!' });
    }
    if (!req.body.orderId) return res.status(400).json({ message: 'Vui lòng đánh giá từ đơn hàng đã hoàn thành.' });
    let reviewedOrder = null;
    if (req.body.orderId) {
      if (!mongoose.isValidObjectId(req.body.orderId)) return res.status(400).json({ message: 'Đơn hàng không hợp lệ.' });
      reviewedOrder = await Order.findById(req.body.orderId);
      const owner = reviewedOrder?.userId && req.userId && String(reviewedOrder.userId) === String(req.userId);
      const guest = reviewedOrder && !reviewedOrder.userId &&
        String(req.body.phone || '').trim() === reviewedOrder.customerInfo.phone &&
        String(req.body.name || '').normalize('NFC').trim().toLocaleLowerCase('vi-VN') ===
        reviewedOrder.customerInfo.name.normalize('NFC').trim().toLocaleLowerCase('vi-VN');
      if (!reviewedOrder || (!owner && !guest)) return res.status(403).json({ message: 'Thông tin đơn hàng không khớp.' });
      if (reviewedOrder.status !== 'Hoàn thành') return res.status(400).json({ message: 'Chỉ đánh giá sản phẩm của đơn đã hoàn thành.' });
      const purchased = new Set(reviewedOrder.items.map(item => Number(item.productId || String(item.id).split('_')[0])));
      if (entries.some(entry => !purchased.has(entry.productId)) || new Set(entries.map(entry => entry.productId)).size !== entries.length)
        return res.status(400).json({ message: 'Sản phẩm không thuộc đơn hàng hoặc bị trùng.' });
    }
    if (entries.some(entry => !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5)) return res.status(400).json({ message: 'Vui lòng chọn từ 1 đến 5 sao.' });
    const rows = entries.map(({ productId, rating, comment }) => ({
      productId,
      orderId: reviewedOrder?._id || null,
      rating,
      comment,
      userId: req.userId || null,
      userName: reviewedOrder.customerInfo.name,
    }));
    const reviews = await saveOrderReviews(reviewedOrder, rows);

    // Đồng bộ rating/số review hiển thị trên Product theo dữ liệu review thật
    try {
      for (const { productId } of entries) {
        const summary = await computeSummary(productId);
        if (summary.count > 0) {
          await Product.updateOne(
            { id: parseInt(productId) },
            { rating: Math.round(summary.avgRating), reviews: String(summary.count) }
          );
        }
      }
    } catch (e) { /* không chặn tạo review nếu đồng bộ lỗi */ }

    res.status(201).json(Array.isArray(req.body.reviews) ? reviews : reviews[0]);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi server!', error: err.message });
  }
});

// Tóm tắt rating thật: { avgRating, count }
router.get('/:productId/summary', async (req, res) => {
  try {
    res.json(await computeSummary(req.params.productId));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

router.get('/:productId', async (req, res) => {
  try {
    const reviews = await Review.aggregate([...purchasedReviewStages(req.params.productId), { $sort: { createdAt: -1 } }]);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

module.exports = router;
