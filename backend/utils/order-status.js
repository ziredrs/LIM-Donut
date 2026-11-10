const mongoose = require('mongoose');
const Order = require('../models/Order');
const Inventory = require('../models/BranchInventory');
const { inventoryQuantities } = require('./inventory');
const User = require('../models/User');
const Voucher = require('../models/Voucher');

async function saveOrderStatus(order, oldStatus, otpProof = null) {
  const session = await mongoose.startSession();
  let settlement;
  const cancelled = order.status === 'Đã hủy';
  const restore = cancelled && ['Đang xử lý', 'Đã đặt', 'Đã xác nhận'].includes(oldStatus) && order.inventoryDeducted && order.branchId;
  try {
    await session.withTransaction(async () => {
      if (cancelled && (oldStatus === 'Đã hủy' || order.cancellation?.processedAt)) throw Object.assign(new Error('Đơn hàng đã được hủy.'), { status: 409 });
      if (otpProof) {
        const Otp = require('../models/OrderCancelOtp');
        const consumed = await Otp.findOneAndDelete({
          _id: otpProof._id, orderId: order._id, phone: order.customerInfo.phone,
          digest: otpProof.digest, ready: true, attempts: { $lte: 5 }, expiresAt: { $gt: new Date() }
        }, { session });
        if (!consumed) throw Object.assign(new Error('OTP không còn hợp lệ. Vui lòng yêu cầu mã mới.'), { status: 400 });
      }
      // Only unprepared cancellations return sellable stock; failed deliveries are not restocked automatically.
      let starsReturned = 0;
      if (cancelled && order.userId) {
        const user = await User.findById(order.userId).session(session);
        if (user) {
          const history = user.starsHistory || [];
          const alreadyReturned = history.some(entry => entry.reason === `Hoàn Star cho đơn ${order.orderId}`);
          starsReturned = alreadyReturned ? 0 : order.starsUsed != null ? Math.max(0, order.starsUsed) :
            history.filter(entry => entry.reason === `Dùng Star cho đơn ${order.orderId}` && entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);
        }
      }
      if (cancelled) settlement = {
        ...(order.cancellation?.toObject?.() || order.cancellation || {}),
        reason: order.cancellation?.reason || 'Hủy bởi cửa hàng',
        at: order.cancellation?.at || new Date(), processedAt: new Date(),
        stockRestored: !!restore, voucherReturned: false, starsReturned,
        depositForfeited: order.depositPaid || order.paymentStatus === 'paid' ? order.depositAmount || 0 : 0,
        paymentReviewRequired: order.paymentStatus === 'paid' && !order.depositPaid
      };
      const result = await Order.updateOne({ _id: order._id, status: oldStatus }, { $set: {
        status: order.status, statusHistory: order.statusHistory,
        evidencePhotoUrl: order.evidencePhotoUrl,
        inventoryDeducted: restore ? false : order.inventoryDeducted,
        ...(cancelled ? { cancellation: settlement } : {})
      } }, { session });
      if (!result.modifiedCount) throw Object.assign(new Error('Đơn hàng đã được thay đổi. Vui lòng tải lại.'), { status: 409 });
      if (restore) {
        for (const [productId, qty] of inventoryQuantities(order.items)) {
          await Inventory.updateOne({ branchId: order.branchId, productId }, { $inc: { stock: qty } }, { session, upsert: true });
        }
      }
      if (cancelled && order.voucherCode && order.voucherConsumed !== false) {
        const returned = await Voucher.updateOne({ code: order.voucherCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
        settlement.voucherReturned = !!returned.modifiedCount;
      }
      if (starsReturned > 0) await User.updateOne({ _id: order.userId }, {
        $inc: { stars: starsReturned },
        $push: { starsHistory: { amount: starsReturned, reason: `Hoàn Star cho đơn ${order.orderId}`, at: settlement.at } }
      }, { session });
      if (cancelled) await Order.updateOne({ _id: order._id }, { $set: { cancellation: settlement } }, { session });
    });
    if (restore) order.inventoryDeducted = false;
    if (cancelled) order.cancellation = settlement;
  } finally { await session.endSession(); }
}
module.exports = { saveOrderStatus };
