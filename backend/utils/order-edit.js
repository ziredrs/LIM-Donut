const fail = message => Object.assign(new Error(message), { status: 400 });
function pickupTime(date, time, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date || '');
  if (!match || !/^(?:0[7-9]|1\d|20):[0-5]\d$|^21:00$/.test(time || '')) throw fail('Vui lòng nhập ngày dd/mm/yyyy và giờ nhận từ 07:00 đến 21:00.');
  const [, day, month, year] = match;
  const stamp = new Date(`${year}-${month}-${day}T${time}:00+07:00`);
  const calendar = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(stamp.getTime()) || calendar.toISOString().slice(0, 10) !== `${year}-${month}-${day}` || stamp <= now) throw fail('Ngày giờ nhận phải hợp lệ và ở tương lai.');
  return { label: `Nhận hàng ngày ${date} - Vào lúc ${time}`, stamp };
}
function parseVnd(value) {
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[.,\sđ₫]/g, ''));
  if (!Number.isSafeInteger(number) || number < 0) throw fail('Giá sản phẩm chưa hợp lệ. Vui lòng liên hệ cửa hàng.');
  return number;
}
function changedItems(order, entries, products) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) throw fail('Đơn phải còn ít nhất một sản phẩm (tối đa 100 dòng).');
  const seen = new Set();
  return entries.map((entry, i) => {
    if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 1000 || !Number.isSafeInteger(entry.productId)) throw fail('Sản phẩm hoặc số lượng không hợp lệ.');
    let original;
    if (entry.sourceIndex != null) {
      if (!Number.isInteger(entry.sourceIndex) || entry.sourceIndex < 0 || entry.sourceIndex >= order.items.length || seen.has(entry.sourceIndex)) throw fail('Dòng sản phẩm bị trùng hoặc không hợp lệ.');
      seen.add(entry.sourceIndex); original = order.items[entry.sourceIndex];
    }
    const originalId = original && Number(String(original.id).split('_')[0]);
    if (originalId === entry.productId) return { ...original, quantity: entry.quantity };
    const product = products.find(product => product.id === entry.productId);
    if (!product || [99, 100].includes(entry.productId)) throw fail('Vui lòng chọn bánh có trong menu. Hộp combo chỉ được đổi số lượng hoặc bỏ khỏi đơn tại đây.');
    return { id: `${product.id}_edit_${i}`, productId: product.id, name: product.name, image: product.image, price: parseVnd(product.price), quantity: entry.quantity, options: {} };
  });
}
function retainedVoucher(voucher, goods) {
  if (!voucher || !voucher.active || (voucher.expiresAt && voucher.expiresAt < new Date()) || goods < (voucher.minOrderValue || 0)) throw fail('Giỏ hàng mới không còn đáp ứng mã giảm giá của đơn. Vui lòng điều chỉnh sản phẩm hoặc liên hệ cửa hàng.');
  let discount = voucher.type === 'percent' ? Math.floor(goods * voucher.value / 100) : voucher.value;
  if (voucher.maxDiscount != null) discount = Math.min(discount, voucher.maxDiscount);
  return Math.min(goods, discount);
}
module.exports = { pickupTime, changedItems, retainedVoucher };
