const Inventory = require('../models/BranchInventory');
const Product = require('../models/Product');
const { inventoryQuantities } = require('./inventory');

async function reserveInventory(branchId, items, session) {
  for (const [productId, quantity] of inventoryQuantities(items)) {
    const result = await Inventory.updateOne({ branchId, productId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { session });
    if (!result.modifiedCount) throw Object.assign(new Error('Chi nhánh không đủ tồn kho cho sản phẩm #' + productId + '. Vui lòng đổi chi nhánh hoặc giảm số lượng.'), { status: 409 });
    await Product.updateOne({ id: productId }, { $inc: { sold: quantity } }, { session });
  }
}
module.exports = { reserveInventory };
