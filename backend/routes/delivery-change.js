const router = require('express').Router({ mergeParams: true });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const Inventory = require('../models/BranchInventory');
const User = require('../models/User');
const { inventoryQuantities } = require('../utils/inventory');
const { shippingFee, distanceKm, branchCoordinates, snapshot, previousFee } = require('../utils/delivery-change');
const { classifyOrderServer } = require('../utils/pricing');
const { geocodeAddress, googleDrivingDistance } = require('../utils/maps');

const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });
function changedMoney(order, total) {
  if (order.paymentStatus === 'paid' || order.depositPaid) return { remainingAmount: order.paymentStatus === 'paid' && !order.depositPaid ? 0 : Math.max(0, total - order.depositAmount) };
  return classifyOrderServer(total, order.orderType === 'custom');
}
function authorize(order, req) {
  const owner = order?.userId && req.userId && String(order.userId) === String(req.userId);
  const guest = order && !order.userId && String(req.body.phone || '').trim() === order.customerInfo.phone &&
    String(req.body.name || '').normalize('NFC').trim().toLocaleLowerCase('vi-VN') === order.customerInfo.name.normalize('NFC').trim().toLocaleLowerCase('vi-VN');
  if (!owner && !guest) throw fail('Thông tin đơn hàng không khớp. Vui lòng đăng nhập hoặc kiểm tra thông tin tra cứu.', 403);
  if (!['Đã đặt', 'Đang xử lý'].includes(order.status)) throw fail('Đơn đã được xác nhận hoặc đang xử lý giao nhận nên không thể đổi địa chỉ tự động. Vui lòng liên hệ cửa hàng.', 409);
}
async function hasStock(order, branch, session) {
  if (order.orderType === 'custom') return true;
  if (String(order.branchId) === String(branch._id) && order.inventoryDeducted) return true;
  for (const [productId, quantity] of inventoryQuantities(order.items)) {
    const row = await Inventory.findOne({ branchId: branch._id, productId }).session(session || null);
    if (!row || row.stock < quantity) return false;
  }
  return true;
}
router.post('/quote', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw fail('Mã đơn không hợp lệ.');
    const order = await Order.findById(req.params.id);
    authorize(order, req);
    if (!['delivery', 'pickup'].includes(req.body.deliveryMethod)) throw fail('Vui lòng chọn hình thức nhận hàng.');
    const branches = await Branch.find({ active: true });
    const method = req.body.deliveryMethod;
    let address = String(req.body.address || '').trim(), coords;
    if (method === 'delivery') {
      if (address.length < 5 || address.length > 500) throw fail('Vui lòng nhập địa chỉ từ 5 đến 500 ký tự.');
      coords = await geocodeAddress(address);
      address = coords.label;
    }
    const measured = [];
    let missingCoordinates = false;
    for (const branch of branches) {
      if (method === 'pickup') {
        if (String(branch._id) === req.body.branchId) measured.push({ branch, distance: 0 });
        continue;
      }
      const point = branchCoordinates(branch);
      if (!point) { missingCoordinates = true; continue; }
      const distance = coords.source === 'google' ? await googleDrivingDistance(point, coords) : distanceKm(coords, point);
      measured.push({ branch, distance });
    }
    const candidates = measured.filter(candidate => candidate.distance <= 15).sort((a, b) => a.distance - b.distance);
    if (method === 'delivery' && !candidates.length && coords.precision === 'street') throw fail('Vị trí theo đường/ngõ mới chỉ là ước tính và chưa đủ để kết luận vượt 15 km. Vui lòng nhập địa chỉ rõ hơn hoặc chọn nhận tại cửa hàng.', 422);
    if (method === 'delivery' && !candidates.length && missingCoordinates) throw fail('Chưa có đủ tọa độ chi nhánh để kiểm tra phạm vi giao hàng. Vui lòng liên hệ cửa hàng.', 409);
    if (!candidates.length) throw fail(method === 'delivery' ? 'Địa chỉ mới nằm ngoài phạm vi 15 km. Vui lòng chọn nhận tại cửa hàng.' : 'Vui lòng chọn chi nhánh nhận bánh đang hoạt động.', 422, { pickupOnly: method === 'delivery' });
    let selected;
    for (const candidate of candidates) if (await hasStock(order, candidate.branch)) { selected = candidate; break; }
    if (!selected) throw fail('Chi nhánh phục vụ địa chỉ này chưa đủ hàng. Bạn có thể chọn nhận ở chi nhánh khác hoặc tiếp tục hủy.', 409);
    if (order.orderType !== 'custom' && !order.inventoryDeducted && String(order.branchId) !== String(selected.branch._id)) throw fail('Đơn cũ chưa có thông tin giữ kho để chuyển chi nhánh tự động. Vui lòng liên hệ cửa hàng.', 409);
    let starsUsed = order.starsUsed || 0;
    if (order.starsUsed == null && order.userId) {
      const user = await User.findById(order.userId);
      starsUsed = (user?.starsHistory || []).filter(entry => entry.reason === `Dùng Star cho đơn ${order.orderId}` && entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0);
    }
    const goods = order.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const oldFee = previousFee(order, starsUsed);
    const fee = method === 'pickup' ? 0 : shippingFee(selected.distance, goods);
    const totalAmount = Math.max(0, order.totalAmount - oldFee + fee);
    if (order.paymentStatus === 'paid' && totalAmount !== order.totalAmount) throw fail('Đơn đã thanh toán cần cửa hàng đối soát chênh lệch phí trước khi đổi địa chỉ. Vui lòng liên hệ cửa hàng hoặc tiếp tục hủy theo chính sách.', 409);
    const money = changedMoney(order, totalAmount);
    const quoted = { purpose: 'delivery-change', orderId: String(order._id), snapshot: snapshot(order),
      deliveryMethod: method, address: method === 'pickup' ? `Lấy tại quầy (${selected.branch.name})` : address,
      branchId: String(selected.branch._id), branchName: selected.branch.name, distanceKm: selected.distance,
      branchStamp: JSON.stringify([selected.branch.address, selected.branch.lat, selected.branch.lng]),
      distanceSource: coords?.source === 'google' ? 'google-driving' : method === 'pickup' ? 'pickup' : 'straight-line',
      locationPrecision: coords?.precision || null, resolvedAddress: coords?.resolvedLabel || null,
      mapsUrl: method === 'delivery' ? `https://www.google.com/maps/dir/?api=1&origin=${branchCoordinates(selected.branch).lat},${branchCoordinates(selected.branch).lng}&destination=${coords.lat},${coords.lng}&travelmode=driving` : null,
      shippingFee: fee, oldShippingFee: oldFee, oldTotalAmount: order.totalAmount, totalAmount,
      depositAmount: money.depositAmount ?? order.depositAmount ?? 0, depositPaid: !!order.depositPaid,
      remainingAmount: money.remainingAmount };
    const token = jwt.sign(quoted, process.env.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
    res.json({ ...quoted, token });
  } catch (err) { res.status(err.status || 500).json({ message: err.status ? err.message : 'Chưa thể kiểm tra địa chỉ mới. Vui lòng thử lại.', pickupOnly: !!err.pickupOnly }); }
});

router.post('/confirm', async (req, res) => {
  let session;
  try {
    let quote;
    try { quote = jwt.verify(req.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw fail('Thông tin xem trước đã hết hạn hoặc không hợp lệ. Vui lòng kiểm tra lại.', 400); }
    if (quote.purpose !== 'delivery-change' || quote.orderId !== req.params.id) throw fail('Thông tin xác nhận không khớp đơn hàng.');
    if (quote.locationPrecision === 'street' && req.body.locationConfirmed !== true) throw fail('Vui lòng xác nhận địa chỉ và vị trí ước tính trước khi cập nhật.');
    session = await mongoose.startSession();
    let updated;
    await session.withTransaction(async () => {
      const order = await Order.findById(req.params.id).session(session);
      authorize(order, req);
      if (snapshot(order) !== quote.snapshot) throw fail('Đơn đã thay đổi hoặc địa chỉ đã được cập nhật. Vui lòng kiểm tra lại trước khi xác nhận.', 409);
      const branch = await Branch.findOne({ _id: quote.branchId, active: true }).session(session);
      if (!branch || JSON.stringify([branch.address, branch.lat, branch.lng]) !== quote.branchStamp || !await hasStock(order, branch, session)) throw fail('Chi nhánh hoặc tồn kho đã thay đổi. Vui lòng kiểm tra lại.', 409);
      if (order.orderType !== 'custom' && order.inventoryDeducted && String(order.branchId) !== quote.branchId) {
        for (const [productId, quantity] of inventoryQuantities(order.items)) {
          const reserved = await Inventory.updateOne({ branchId: branch._id, productId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { session });
          if (!reserved.modifiedCount) throw fail('Chi nhánh mới không còn đủ hàng. Vui lòng kiểm tra lại.', 409);
          await Inventory.updateOne({ branchId: order.branchId, productId }, { $inc: { stock: quantity } }, { session, upsert: true });
        }
      }
      const money = changedMoney(order, quote.totalAmount);
      const revision = order.deliveryRevision || 0;
      const condition = { _id: order._id, status: order.status, ...(revision ? { deliveryRevision: revision } : { $or: [{ deliveryRevision: 0 }, { deliveryRevision: { $exists: false } }] }) };
      const result = await Order.updateOne(condition, { $set: {
        'customerInfo.address': quote.address, branchId: branch._id, branchName: branch.name,
        deliveryMethod: quote.deliveryMethod, deliveryDistanceKm: quote.distanceKm, shippingFee: quote.shippingFee, totalAmount: quote.totalAmount, ...money
      }, $inc: { deliveryRevision: 1 }, $push: { deliveryChangeHistory: {
        at: new Date(), previous: { address: order.customerInfo.address, branchId: order.branchId, deliveryMethod: order.deliveryMethod, totalAmount: order.totalAmount },
        next: { address: quote.address, branchId: branch._id, deliveryMethod: quote.deliveryMethod, shippingFee: quote.shippingFee, totalAmount: quote.totalAmount }
      } } }, { session });
      if (!result.modifiedCount) throw fail('Đơn hàng vừa được cập nhật. Vui lòng tải lại.', 409);
      updated = await Order.findById(order._id).session(session);
    });
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ message: err.status ? err.message : 'Không thể cập nhật địa chỉ. Đơn hàng chưa được thay đổi.' }); }
  finally { if (session) await session.endSession(); }
});
module.exports = router;
module.exports.authorize = authorize;
module.exports.changedMoney = changedMoney;
