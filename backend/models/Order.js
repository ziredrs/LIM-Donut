const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  branchName: { type: String, default: '' },
  inventoryDeducted: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customerInfo: {
    name: String,
    phone: String,
    address: String,
    deliveryTime: String,
    notes: String,
    isGift: { type: Boolean, default: false },
    giftMessage: { type: String, default: '' },
    hideGiftPrice: { type: Boolean, default: false }
  },
  items: [mongoose.Schema.Types.Mixed],
  totalAmount: Number,
  shippingFee: { type: Number, default: null },
  deliveryRevision: { type: Number, default: 0 },
  deliveryDistanceKm: { type: Number, default: null },
  orderEditHistory: [mongoose.Schema.Types.Mixed],
  deliveryChangeHistory: [mongoose.Schema.Types.Mixed],
  orderType: { type: String, enum: ['small', 'large', 'custom'], default: 'small' },
  depositPercent: { type: Number, default: 0 },
  depositAmount: { type: Number, default: 0 },
  remainingAmount: Number,
  depositPaid: { type: Boolean, default: false },
  deliveryMethod: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
  paymentMethod: { type: String, enum: ['cash', 'momo', 'zalopay', 'wallet', 'vnpay'], default: 'cash' },
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  customPartyMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  referralDiscount: { type: Number, default: 0 },
  voucherCode: { type: String, default: null },
  voucherDiscount: { type: Number, default: 0 },
  voucherConsumed: { type: Boolean, default: null },
  starsUsed: { type: Number, default: null },
  cancellation: {
    reason: String, note: String, at: Date, processedAt: Date,
    stockRestored: Boolean, voucherReturned: Boolean, starsReturned: Number,
    depositForfeited: Number,
    paymentReviewRequired: Boolean
  },
  cancelDeadline: { type: Date, default: null },
  evidencePhotoUrl: { type: String, default: null },
  status: {
    type: String,
    enum: [
      'Đã đặt', 'Đã xác nhận', 'Đang chuẩn bị', 'Đã đóng gói',
      'Đang giao', 'Sẵn sàng lấy', 'Hoàn thành',
      'Thanh toán thất bại', 'Giao thất bại', 'Không tới lấy',
      'Đã hủy', 'Đã hoàn tiền'
    ],
    default: 'Đã đặt'
  },
  statusHistory: [{
    status: String,
    at: { type: Date, default: Date.now }
  }],
  reviewedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

orderSchema.index({ userId: 1 });
orderSchema.index({ 'customerInfo.phone': 1 });

module.exports = mongoose.model('Order', orderSchema);
