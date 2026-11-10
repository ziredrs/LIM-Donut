const crypto = require('crypto');

function shippingFee(distance, goodsTotal) {
  if (!Number.isFinite(distance) || distance < 0 || distance > 15) return null;
  if (!Number.isFinite(goodsTotal) || goodsTotal < 0) throw Error('Invalid goods total');
  if (distance <= 5) return goodsTotal < 500000 ? 20000 : goodsTotal <= 2000000 ? 10000 : 0;
  if (distance <= 10) return goodsTotal <= 2000000 ? 30000 : 10000;
  return goodsTotal < 500000 ? 40000 : goodsTotal <= 2000000 ? 30000 : 20000;
}
function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dlat = rad(b.lat - a.lat), dlng = rad(b.lng - a.lng);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function branchCoordinates(branch) {
  if (Number.isFinite(branch.lat) && Number.isFinite(branch.lng)) return { lat: branch.lat, lng: branch.lng };
  const address = `${branch.name} ${branch.address}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (address.includes('to hieu')) return { lat: 21.0425744, lng: 105.7959545 };
  if (address.includes('tho nhuom')) return { lat: 21.026179, lng: 105.8451822 };
  return null;
}
function snapshot(order) {
  return crypto.createHash('sha256').update(JSON.stringify([
    String(order._id), order.status, order.customerInfo.address, String(order.branchId),
    order.deliveryMethod, order.totalAmount, order.shippingFee, order.paymentStatus,
    order.depositPaid, order.deliveryRevision || 0, order.items, order.customerInfo.deliveryTime,
    order.starsUsed, order.voucherCode, order.voucherDiscount, order.referralDiscount
  ])).digest('hex');
}
function previousFee(order, starsUsed = 0) {
  if (order.deliveryMethod === 'pickup') return 0;
  if (Number.isFinite(order.shippingFee) && order.shippingFee >= 0) return order.shippingFee;
  const goods = order.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const inferred = order.totalAmount - goods + (order.voucherDiscount || 0) + (order.referralDiscount || 0) + starsUsed;
  if (![0, 10000, 20000, 30000, 40000].includes(inferred)) throw Object.assign(new Error('Đơn cũ chưa đủ dữ liệu phí giao hàng để cập nhật tự động. Vui lòng liên hệ cửa hàng hoặc tiếp tục hủy theo chính sách.'), { status: 409 });
  return inferred;
}
module.exports = { shippingFee, distanceKm, branchCoordinates, snapshot, previousFee };
