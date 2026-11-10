function inventoryQuantities(items) {
  const quantities = new Map();
  const add = (id, qty) => {
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(qty) || qty <= 0)
      throw Object.assign(new Error('Sản phẩm hoặc số lượng không hợp lệ.'), { status: 400 });
    const total = (quantities.get(id) || 0) + qty;
    if (!Number.isSafeInteger(total)) throw Object.assign(new Error('Số lượng vượt giới hạn.'), { status: 400 });
    quantities.set(id, total);
  };
  for (const item of items) {
    const id = Number(String(item.id).split('_')[0]), qty = Number(item.quantity);
    if (id === 99 || id === 100) {
      const donuts = item.options?.boxDonuts;
      if (!Array.isArray(donuts) || donuts.length !== (id === 99 ? 4 : 6))
        throw Object.assign(new Error('Vui lòng chọn đủ bánh trong hộp combo.'), { status: 400 });
      for (const donut of donuts) add(Number(donut.productId), qty);
    } else add(id, qty);
  }
  return quantities;
}
module.exports = { inventoryQuantities };
