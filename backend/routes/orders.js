const { reserveInventory } = require('../utils/reserve-inventory');
const { withReviewState } = require('../utils/order-review');
const { cancellationDetails } = require('../utils/cancellation');
const crypto = require('crypto');
const OrderCancelOtp = require('../models/OrderCancelOtp');
const { otpLimiter, cancelOtpVerifyLimiter } = require('../middleware/rateLimiters');
const { otpDigest, canCancelOrder, sendCancelSms, cancelSmsConfigured, localDemoEnabled } = require('../utils/cancel-otp');
const { stockProductsPipeline } = require('../utils/stock-products');
const { saveOrderStatus } = require('../utils/order-status');
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const optionalAuth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const { computeOrderTotals, classifyOrderServer } = require('../utils/pricing');
const { validateVoucher } = require('./vouchers');
const Voucher = require('../models/Voucher');

const VALID_TRANSITIONS = {
  'Đã đặt':        ['Đã xác nhận'],
  'Đã xác nhận':   ['Đang chuẩn bị'],
  'Đang chuẩn bị': ['Đã đóng gói'],
  'Đã đóng gói':   ['Đang giao', 'Sẵn sàng lấy'],
  'Đang giao':     ['Hoàn thành'],
  'Sẵn sàng lấy':  ['Hoàn thành'],
};

const EXCEPTION_STATUSES = ['Thanh toán thất bại', 'Giao thất bại', 'Không tới lấy', 'Đã hủy', 'Đã hoàn tiền'];
const TERMINAL_STATUSES = ['Hoàn thành', ...EXCEPTION_STATUSES];

router.use(optionalAuth);
router.use('/:id/delivery-change', require('./delivery-change'));
router.use('/:id/edit', require('./order-edit'));

router.get('/', async (req, res) => {
  try {
    if (req.query.mine === 'true') {
      if (!req.userId) return res.status(401).json({ message: 'Vui lòng đăng nhập để xem đơn hàng.' });
      const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
      return res.json(await withReviewState(orders));
    }
    if (req.query.all === 'true') {
      return requireAdmin(req, res, async () => {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
      });
    }
    return res.status(400).json({ message: 'Thiếu tham số truy vấn.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

router.get('/lookup', async (req, res) => {
  try {
    const { phone, name } = req.query;
    if (!phone || !name) return res.status(400).json({ message: 'Vui lòng cung cấp tên và số điện thoại.' });
    
    const nfcName = name.normalize('NFC');
    const nfdName = name.normalize('NFD');
    
    const escapedNFC = nfcName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patternNFC = `^\\s*${escapedNFC.replace(/\s+/g, '\\s+')}\\s*$`;
    
    const escapedNFD = nfdName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patternNFD = `^\\s*${escapedNFD.replace(/\s+/g, '\\s+')}\\s*$`;
    
    const orders = await Order.find({
      'customerInfo.phone': phone,
      $or: [
        { 'customerInfo.name': { $regex: new RegExp(patternNFC, 'i') } },
        { 'customerInfo.name': { $regex: new RegExp(patternNFD, 'i') } }
      ]
    }).sort({ createdAt: -1 });
    res.json(await withReviewState(orders));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.cancellation;
    delete data.deliveryChangeHistory;
    delete data.orderEditHistory;
    delete data.deliveryDistanceKm;
    data.deliveryRevision = 0;
    data.starsUsed = 0;
    data.voucherConsumed = false;
    if (req.userId) data.userId = req.userId;

    // Validate input
    if (!data.customerInfo || !data.customerInfo.name || !data.customerInfo.name.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tên người nhận.' });
    }
    data.customerInfo.name = data.customerInfo.name.normalize('NFC').trim();
    if (!data.customerInfo.phone || !/^\d{10}$/.test(data.customerInfo.phone)) {
      return res.status(400).json({ message: 'Số điện thoại phải gồm đúng 10 chữ số.' });
    }

    const isCustomParty = data.orderType === 'custom';
    if (!mongoose.isValidObjectId(data.branchId)) return res.status(400).json({ message: 'Vui lòng chọn chi nhánh xử lý đơn.' });
    const branch = await Branch.findOne({ _id: data.branchId, active: true });
    if (!branch) return res.status(400).json({ message: 'Chi nhánh không còn hoạt động.' });
    data.branchName = branch.name;

    if (!isCustomParty) {
      if (!Array.isArray(data.items) || data.items.length === 0) {
        return res.status(400).json({ message: 'Đơn hàng phải có ít nhất 1 sản phẩm.' });
      }

      // Server-side price verification
      const computedTotal = computeOrderTotals(data.items, data.shippingFee || 0);
      const starsToUse = parseInt(data.starsToUse) || 0;
      // Giảm giá giới thiệu: tối đa 15% tạm tính, không cho client gửi số tuỳ ý
      const referralDiscount = Math.min(parseInt(data.referralDiscount) || 0, Math.floor(computedTotal * 0.15));
      data.referralDiscount = referralDiscount;

      // Voucher: validate lại phía server, không tin số tiền giảm client gửi.
      // Tính trên tạm tính hàng (không gồm phí ship) — cùng cơ sở với client
      let voucherDiscount = 0;
      if (data.voucherCode) {
        const goodsSubtotal = computedTotal - (parseInt(data.shippingFee) || 0);
        const vr = await validateVoucher(data.voucherCode, goodsSubtotal);
        if (!vr.valid) return res.status(400).json({ message: vr.message });
        voucherDiscount = vr.discount;
        data.voucherCode = vr.voucher.code;
        data.voucherDiscount = voucherDiscount;
      }

      const tolerance = starsToUse + 1;
      if (Math.abs(computedTotal - starsToUse - referralDiscount - voucherDiscount - data.totalAmount) > tolerance) {
        return res.status(400).json({ message: 'Giá trị đơn không khớp, vui lòng thử lại.' });
      }
    } else {
      if (!data.totalAmount || data.totalAmount <= 0) {
        return res.status(400).json({ message: 'Giá trị đơn Custom Party không hợp lệ.' });
      }
    }

    // Server recalculates deposit
    const cls = classifyOrderServer(data.totalAmount, isCustomParty);
    data.orderType = cls.orderType;
    data.depositPercent = cls.depositPercent;
    data.depositAmount = cls.depositAmount;
    data.remainingAmount = cls.remainingAmount;

    if (!data.statusHistory) {
      data.statusHistory = [{ status: data.status || 'Đã đặt', at: new Date() }];
    }

    const starsToUse = parseInt(data.starsToUse) || 0;
    delete data.starsToUse;

    // Retry up to 3 times on duplicate orderId
    let newOrder;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          data.orderId = 'DH-' + Math.floor(1000000 + Math.random() * 9000000);
        }
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            if (starsToUse > 0 && req.userId) {
              const user = await User.findById(req.userId).session(session);
              if (!user || (user.stars || 0) < starsToUse) {
                throw Object.assign(new Error('Không đủ Lịm Star.'), { status: 400 });
              }
              const maxStars = Math.floor(data.totalAmount * 0.3);
              const actualStars = Math.min(starsToUse, maxStars);
              user.stars -= actualStars;
              user.starsHistory.push({ amount: -actualStars, reason: `Dùng Star cho đơn ${data.orderId}`, at: new Date() });
              await user.save({ session });
              data.starsUsed = actualStars;
            }

            if (!isCustomParty) {
              await reserveInventory(branch._id, data.items, session);
            }
            if (data.voucherCode) {
              const used = await Voucher.updateOne({ code: data.voucherCode, active: true, $expr: { $or: [{ $eq: ['$usageLimit', null] }, { $lt: ['$usedCount', '$usageLimit'] }] } }, { $inc: { usedCount: 1 } }, { session });
              if (!used.modifiedCount) throw Object.assign(new Error('Mã giảm giá không còn lượt sử dụng.'), { status: 409 });
              data.voucherConsumed = true;
            }
            data.inventoryDeducted = !isCustomParty;
            newOrder = new Order(data);
            await newOrder.save({ session });
          });
        } finally { await session.endSession(); }
        break;
      } catch (saveErr) {
        if (saveErr.code === 11000 && attempt < 2) continue;
        throw saveErr;
      }
    }

    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi không thể tạo đơn hàng!', error: err.message });
  }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });

    const { newStatus, evidencePhotoUrl } = req.body;
    if (!newStatus) return res.status(400).json({ message: 'Thiếu trạng thái mới.' });

    const current = order.status;
    if (TERMINAL_STATUSES.includes(current)) {
      return res.status(400).json({ message: `Đơn đã ở trạng thái cuối "${current}", không thể chuyển tiếp.` });
    }

    const isException = EXCEPTION_STATUSES.includes(newStatus);
    const allowed = VALID_TRANSITIONS[current] || [];

    if (!isException && !allowed.includes(newStatus)) {
      return res.status(400).json({ message: `Không thể chuyển từ "${current}" sang "${newStatus}".` });
    }

    if (newStatus === 'Đã đóng gói' && !evidencePhotoUrl) {
      return res.status(400).json({ message: 'Cần chụp ảnh bằng chứng trước khi đóng gói.' });
    }

    order.status = newStatus;
    if (evidencePhotoUrl) order.evidencePhotoUrl = evidencePhotoUrl;
    order.statusHistory.push({ status: newStatus, at: new Date() });
    await saveOrderStatus(order, current);

    // Award stars on completion
    if (newStatus === 'Hoàn thành' && order.userId) {
      try {
        const baseStars = Math.round(order.totalAmount / 1000) * 100;
        const user = await User.findById(order.userId);
        if (user) {
          // Tháng sinh nhật x3 (ưu tiên, không cộng dồn với x2 đơn custom)
          const isBirthdayMonth = user.birthday && new Date(user.birthday).getMonth() === new Date().getMonth();
          let starAmount = baseStars;
          let reason = `Đơn ${order.orderId} hoàn thành`;
          if (isBirthdayMonth) {
            starAmount = baseStars * 3;
            reason += ' (x3 tháng sinh nhật)';
          } else if (order.orderType === 'custom') {
            starAmount = baseStars * 2;
          }
          user.stars = (user.stars || 0) + starAmount;
          user.starsHistory.push({ amount: starAmount, reason, at: new Date() });
          await user.save();
        }
      } catch (e) { /* non-blocking */ }
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

const Complaint = require('../models/Complaint');
const ContactMessage = require('../models/ContactMessage');

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [ordersByStatus, revenueToday, revenueThisWeek, revenueThisMonth, topProducts, pendingComplaints, unreadContacts, lowStockProducts, outOfStockCount, recentOrders, dailyRevenue, allProducts] = await Promise.all([
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { status: 'Hoàn thành', createdAt: { $gte: startOfDay } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Order.aggregate([{ $match: { status: 'Hoàn thành', createdAt: { $gte: startOfWeek } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Order.aggregate([{ $match: { status: 'Hoàn thành', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      Product.find().sort({ sold: -1 }).limit(5).select('id name image sold price'),
      Complaint.countDocuments({ status: 'Chờ xử lý' }),
      ContactMessage.countDocuments({ status: 'Chưa xử lý' }),
      Product.aggregate([...stockProductsPipeline(), { $match: { stock: { $gt: 0, $lt: 5 } } }, { $project: { id: 1, name: 1, stock: 1, image: 1 } }]),
      Product.aggregate([...stockProductsPipeline(), { $match: { stock: 0 } }, { $count: 'count' }]).then(rows => rows[0]?.count || 0),
      Order.find().sort({ createdAt: -1 }).limit(5).select('orderId customerInfo totalAmount status createdAt'),
      Order.aggregate([
        { $match: { status: 'Hoàn thành', createdAt: { $gte: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Product.find().select('categories sold')
    ]);

    const statusMap = {};
    ordersByStatus.forEach(s => statusMap[s._id] = s.count);

    const categorySales = {};
    allProducts.forEach(p => {
      const sold = p.sold || 0;
      const cat = p.categories && p.categories[0] ? p.categories[0] : 'Khác';
      categorySales[cat] = (categorySales[cat] || 0) + sold;
    });

    res.json({
      ordersByStatus: statusMap,
      revenueToday: revenueToday[0]?.total || 0,
      revenueThisWeek: revenueThisWeek[0]?.total || 0,
      revenueThisMonth: revenueThisMonth[0]?.total || 0,
      topProducts,
      pendingComplaints,
      unreadContacts,
      lowStockProducts,
      outOfStockCount,
      recentOrders,
      dailyRevenue,
      categorySales
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

router.post('/:id/cancel-otp', otpLimiter, async (req, res) => {
  let digest;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Đơn hàng không hợp lệ.' });
    const order = await Order.findById(req.params.id);
    const phone = String(req.body.phone || '').trim();
    const name = String(req.body.name || '').normalize('NFC').trim().toLocaleLowerCase('vi-VN');
    if (!order || phone !== order.customerInfo.phone || name !== String(order.customerInfo.name).normalize('NFC').trim().toLocaleLowerCase('vi-VN'))
      return res.status(400).json({ message: 'Thông tin đặt hàng không khớp.' });
    if (!canCancelOrder(order)) return res.status(403).json({ message: 'Chỉ đơn hàng thuộc nhóm Đang xử lý mới có thể hủy.' });
    const demo = localDemoEnabled(req);
    if (process.env.CANCEL_OTP_DEMO === 'true' && !demo) return res.status(403).json({ message: 'OTP demo chỉ được sử dụng trên local, không qua proxy và không ở production.' });
    if (!demo && !cancelSmsConfigured())
      return res.status(503).json({ message: 'Chưa cấu hình dịch vụ gửi SMS OTP. Vui lòng liên hệ cửa hàng.' });
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    digest = otpDigest(order._id, phone, code);
    const now = new Date();
    try {
      await OrderCancelOtp.findOneAndUpdate({ orderId: order._id, sentAt: { $lte: new Date(now.getTime() - 60000) } }, {
        $set: { phone, digest, expiresAt: new Date(now.getTime() + 300000), sentAt: now, attempts: 0, ready: false, isDemo: demo }
      }, { upsert: true, new: true });
    } catch (err) {
      if (err.code === 11000) return res.status(429).json({ message: 'Vui lòng chờ 60 giây trước khi gửi lại OTP.' });
      throw err;
    }
    if (!demo) await sendCancelSms(order.customerInfo.phone, code);
    await OrderCancelOtp.updateOne({ orderId: order._id, digest }, { $set: { ready: true } });
    res.json({ message: demo ? 'OTP demo trên local, không gửi SMS.' : 'Đã gửi OTP đến số điện thoại đặt hàng.', maskedPhone: phone.slice(0, 3) + '****' + phone.slice(-3), expiresIn: 300, retryAfter: 60, ...(demo ? { demoCode: code, isDemo: true } : {}) });
  } catch (err) {
    if (digest) await OrderCancelOtp.deleteOne({ orderId: req.params.id, digest }).catch(() => {});
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Không gửi được OTP. Vui lòng thử lại.' });
  }
});

router.patch('/:id/cancel', cancelOtpVerifyLimiter, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Đơn hàng không hợp lệ.' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng.' });
    let otpProof = null;
    if (!canCancelOrder(order)) return res.status(403).json({ message: 'Chỉ đơn hàng thuộc nhóm Đang xử lý mới có thể hủy.' });
    const cancellation = cancellationDetails(req.body.reason, req.body.note);
    const isOwner = req.userId && order.userId && String(req.userId) === String(order.userId);
    if (!isOwner || req.body.otp !== undefined) {
      if (typeof req.body.otp !== 'string' || !/^\d{4}$/.test(req.body.otp))
        return res.status(400).json({ message: 'Vui lòng nhập đúng 4 chữ số OTP.' });
      const challenge = await OrderCancelOtp.findOneAndUpdate({ orderId: order._id, ready: true, phone: order.customerInfo.phone,
        ...(!localDemoEnabled(req) ? { isDemo: { $ne: true } } : {}),
        expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
      const supplied = otpDigest(order._id, order.customerInfo.phone, req.body.otp);
      if (!challenge || !crypto.timingSafeEqual(Buffer.from(challenge.digest, 'hex'), Buffer.from(supplied, 'hex')))
        return res.status(400).json({ message: 'OTP không đúng, đã hết hạn hoặc đã vượt quá 5 lần thử.' });
      otpProof = challenge;
    }
    if (!canCancelOrder(order)) return res.status(403).json({ message: 'Chỉ đơn hàng thuộc nhóm Đang xử lý mới có thể hủy.' });

    const oldStatus = order.status;
    order.status = 'Đã hủy';
    order.cancellation = cancellation;
    order.statusHistory.push({ status: 'Đã hủy', at: cancellation.at });
    await saveOrderStatus(order, oldStatus, otpProof);
    res.json(order);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi server!', error: err.message });
  }
});

module.exports = router;
