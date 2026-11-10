const router = require('express').Router({ mergeParams: true });
const mongoose = require('mongoose'), jwt = require('jsonwebtoken');
const Order = require('../models/Order'), Branch = require('../models/Branch'), Product = require('../models/Product');
const Inventory = require('../models/BranchInventory'), Voucher = require('../models/Voucher'), User = require('../models/User');
const { inventoryQuantities } = require('../utils/inventory');
const { authorize, changedMoney } = require('./delivery-change');
const { snapshot, shippingFee, previousFee, branchCoordinates, distanceKm } = require('../utils/delivery-change');
const { geocodeAddress, googleDrivingDistance } = require('../utils/maps');
const { changedItems, pickupTime, retainedVoucher } = require('../utils/order-edit');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function buildEdit(order, input, session = null) {
  if (input.kind === 'time') {
    if (order.branchId && !await Branch.findOne({ _id: order.branchId, active: true }).session(session)) throw fail('Chi nhánh xử lý đơn không còn hoạt động. Vui lòng liên hệ cửa hàng.');
    const chosen = pickupTime(input.date, input.time);
    if (order.orderType === 'custom') {
      const tier = String(order.customPartyMeta?.tier?.id || order.customPartyMeta?.tier?.name || order.customerInfo.notes || '');
      const days = /party l|\bl\b/i.test(tier) ? 3 : /party m|\bm\b/i.test(tier) ? 2 : 1;
      if (chosen.stamp.getTime() - Date.now() < days * 86400000) throw fail(`Gói Custom Party cần đặt trước tối thiểu ${days} ngày.`);
    }
    return { patch: { 'customerInfo.deliveryTime': chosen.label }, summary: { kind: 'time', deliveryTime: chosen.label, totalAmount: order.totalAmount, oldTotalAmount: order.totalAmount } };
  }
  if (input.kind !== 'items') throw fail('Thao tác cập nhật không hợp lệ.');
  if (order.orderType === 'custom') throw fail('Bánh Custom Party cần cấu hình riêng. Vui lòng liên hệ Lịm để sửa mẫu bánh hoặc tiếp tục hủy theo chính sách.');
  if (!order.inventoryDeducted || !order.branchId) throw fail('Đơn cũ chưa có thông tin giữ kho để sửa sản phẩm tự động. Vui lòng liên hệ cửa hàng.');
  const branch = await Branch.findOne({ _id: order.branchId, active: true }).session(session);
  if (!branch) throw fail('Chi nhánh xử lý đơn không còn hoạt động.');
  if (!Array.isArray(input.items) || input.items.length > 100) throw fail('Danh sách sản phẩm không hợp lệ.');
  const products = await Product.find({ id: { $in: input.items.map(item => item?.productId).filter(Number.isSafeInteger) } }).session(session);
  const items = changedItems(order, input.items, products);
  const before = inventoryQuantities(order.items), after = inventoryQuantities(items);
  for (const [productId, quantity] of after) {
    const increase = quantity - (before.get(productId) || 0);
    if (increase > 0) {
      const row = await Inventory.findOne({ branchId: order.branchId, productId }).session(session);
      if (!row || row.stock < increase) throw fail('Chi nhánh không đủ hàng. Vui lòng giảm số lượng hoặc chọn bánh khác.', 409);
    }
  }
  let oldStars = order.starsUsed;
  if (oldStars == null) {
    const user = order.userId ? await User.findById(order.userId).session(session) : null;
    oldStars = (user?.starsHistory || []).filter(row => row.reason === `Dùng Star cho đơn ${order.orderId}` && row.amount < 0).reduce((sum, row) => sum - row.amount, 0);
  }
  const goods = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const oldGoods = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const oldFee = previousFee(order, oldStars);
  let fee = 0;
  let recalculatedDistance;
  if (order.deliveryMethod !== 'pickup') {
    const distance = order.deliveryDistanceKm ?? (order.deliveryChangeHistory || []).at(-1)?.next?.distanceKm;
    const band = total => total < 500000 ? 0 : total <= 2000000 ? 1 : 2;
    if (Number.isFinite(distance)) fee = shippingFee(distance, goods);
    else if (band(goods) === band(oldGoods)) fee = oldFee;
    else {
      const origin = branchCoordinates(branch);
      if (!origin) throw fail('Chi nhánh chưa có tọa độ để tính lại phí. Vui lòng liên hệ cửa hàng.');
      const location = await geocodeAddress(order.customerInfo.address);
      recalculatedDistance = location.source === 'google' ? await googleDrivingDistance(origin, location) : distanceKm(origin, location);
      fee = shippingFee(recalculatedDistance, goods);
    }
    if (fee == null) throw fail('Địa chỉ giao hàng đang ngoài phạm vi phục vụ.');
  }
  const voucher = order.voucherCode ? await Voucher.findOne({ code: order.voucherCode }).session(session) : null;
  const discount = order.voucherCode ? retainedVoucher(voucher, goods) : 0;
  const referral = order.referralDiscount > 0 ? Math.floor(goods * .15) : 0;
  const starsUsed = Math.min(oldStars, Math.floor(goods * .3), Math.max(0, goods - referral - discount));
  const total = Math.max(0, goods + fee - discount - referral - starsUsed);
  if (order.paymentStatus === 'paid' && total !== order.totalAmount) throw fail('Đơn đã thanh toán cần đối soát chênh lệch tiền. Vui lòng liên hệ cửa hàng.', 409);
  const money = changedMoney(order, total);
  return { items, starsReturned: oldStars - starsUsed,
    patch: { items, totalAmount: total, shippingFee: fee, voucherDiscount: discount, referralDiscount: referral, starsUsed, ...(Number.isFinite(recalculatedDistance) ? { deliveryDistanceKm: recalculatedDistance } : {}), ...money },
    summary: { kind: 'items', items, oldTotalAmount: order.totalAmount, totalAmount: total, shippingFee: fee, voucherDiscount: discount,
      starsReturned: oldStars - starsUsed, depositAmount: money.depositAmount ?? order.depositAmount ?? 0, remainingAmount: money.remainingAmount } };
}
router.post('/quote', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail('Mã đơn không hợp lệ.');
    const order = await Order.findById(req.params.id); authorize(order, req);
    const edit = await buildEdit(order, req.body);
    const input = req.body.kind === 'time' ? { kind: 'time', date: req.body.date, time: req.body.time } : { kind: 'items', items: req.body.items.map(({ sourceIndex, productId, quantity }) => ({ sourceIndex, productId, quantity })) };
    const token = jwt.sign({ purpose: 'order-edit', orderId: String(order._id), snapshot: snapshot(order), input, summary: edit.summary }, process.env.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
    res.json({ ...edit.summary, token });
  } catch (err) { res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể kiểm tra thay đổi. Vui lòng thử lại.' }); }
});
router.post('/confirm', async (req, res) => {
  let session;
  try {
    let quote;
    try { quote = jwt.verify(req.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw fail('Thông tin xem trước đã hết hạn hoặc không hợp lệ.'); }
    if (quote.purpose !== 'order-edit' || quote.orderId !== req.params.id) throw fail('Thông tin xác nhận không khớp đơn hàng.');
    session = await mongoose.startSession(); let updated;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session); authorize(order, req);
      if (snapshot(order) !== quote.snapshot) throw fail('Đơn đã thay đổi. Vui lòng kiểm tra lại trước khi xác nhận.', 409);
      const edit = await buildEdit(order, quote.input, session);
      if (JSON.stringify(edit.summary) !== JSON.stringify(quote.summary)) throw fail('Giá, ưu đãi hoặc phí đã thay đổi. Vui lòng xem lại thông tin mới.', 409);
      if (edit.items) {
        const before = inventoryQuantities(order.items), after = inventoryQuantities(edit.items);
        for (const productId of new Set([...before.keys(), ...after.keys()])) {
          const delta = (after.get(productId) || 0) - (before.get(productId) || 0);
          if (!delta) continue;
          const result = await Inventory.updateOne({ branchId: order.branchId, productId, ...(delta > 0 ? { stock: { $gte: delta } } : {}) }, { $inc: { stock: -delta } }, { session });
          if (!result.modifiedCount) throw fail('Tồn kho vừa thay đổi, vui lòng kiểm tra lại.', 409);
          await Product.updateOne({ id: productId }, { $inc: { sold: delta } }, { session });
        }
      }
      if (edit.starsReturned > 0 && order.userId) await User.updateOne({ _id: order.userId }, { $inc: { stars: edit.starsReturned }, $push: { starsHistory: { amount: edit.starsReturned, reason: `Hoàn Star do sửa đơn ${order.orderId}`, at: new Date() } } }, { session });
      const revision = order.deliveryRevision || 0;
      const result = await Order.updateOne({ _id: order._id, status: order.status, ...(revision ? { deliveryRevision: revision } : { $or: [{ deliveryRevision: 0 }, { deliveryRevision: { $exists: false } }] }) }, {
        $set: edit.patch, $inc: { deliveryRevision: 1 }, $push: { orderEditHistory: { at: new Date(), kind: quote.input.kind,
          previous: { items: order.items, totalAmount: order.totalAmount, deliveryTime: order.customerInfo.deliveryTime }, next: edit.summary } }
      }, { session });
      if (!result.modifiedCount) throw fail('Đơn vừa được cập nhật. Vui lòng tải lại.', 409);
      updated = await Order.findById(order._id).session(session);
    }); res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể cập nhật. Đơn hàng chưa được thay đổi.' }); }
  finally { if (session) await session.endSession(); }
});
module.exports = router;
