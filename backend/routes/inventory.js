const router = require('express').Router();
const mongoose = require('mongoose');
const Inventory = require('../models/BranchInventory');
const Branch = require('../models/Branch');
const Product = require('../models/Product');
const requireAdmin = require('../middleware/requireAdmin');

router.get('/:branchId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.branchId)) return res.status(400).json({ message: 'Chi nhánh không hợp lệ.' });
    if (!await Branch.exists({ _id: req.params.branchId, active: true })) return res.status(404).json({ message: 'Chi nhánh không hoạt động.' });
    res.json(await Inventory.find({ branchId: req.params.branchId }).lean());
  } catch (err) { res.status(500).json({ message: 'Không tải được tồn kho.' }); }
});

router.put('/:branchId/:productId', requireAdmin, async (req, res) => {
  try {
    const stock = req.body.stock, productId = Number(req.params.productId);
    if ([99, 100].includes(productId)) return res.status(400).json({ message: 'Combo sử dụng kho của từng bánh bên trong, không nhập kho riêng cho hộp.' });
    if (!mongoose.isValidObjectId(req.params.branchId) || !Number.isSafeInteger(productId) || !Number.isSafeInteger(stock) || stock < 0)
      return res.status(400).json({ message: 'Tồn kho phải là số nguyên không âm, chi nhánh và sản phẩm phải hợp lệ.' });
    if (!await Branch.exists({ _id: req.params.branchId, active: true }) || !await Product.exists({ id: productId }))
      return res.status(404).json({ message: 'Không tìm thấy chi nhánh hoặc sản phẩm.' });
    res.json(await Inventory.findOneAndUpdate({ branchId: req.params.branchId, productId }, { $set: { stock } }, { upsert: true, new: true, runValidators: true }));
  } catch (err) { res.status(500).json({ message: 'Không lưu được tồn kho.' }); }
});
module.exports = router;
