const { stockProductsPipeline } = require('../utils/stock-products');
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const requireAdmin = require('../middleware/requireAdmin');

// Danh sách sản phẩm (public)
router.get('/', async (req, res) => {
  try {
    const products = await Product.aggregate([...stockProductsPipeline(), { $sort: { id: 1 } }]);
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// Chi tiết 1 sản phẩm theo id số (public)
router.get('/:id', async (req, res) => {
  try {
    const [product] = await Product.aggregate([{ $match: { id: Number(req.params.id) } }, ...stockProductsPipeline()]);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// Thêm món mới (admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.stock;
    if (!data.name || !data.price) {
      return res.status(400).json({ message: 'Thiếu tên hoặc giá sản phẩm.' });
    }
    if (data.id === undefined) {
      const max = await Product.findOne().sort({ id: -1 }).select('id');
      // id mới bắt đầu từ 101 để không đụng dải combo box 99/100
      data.id = Math.max((max?.id || 0) + 1, 101);
    }
    const product = await Product.create(data);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'id sản phẩm đã tồn tại.' });
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// Sửa món (admin) — giá, tồn kho, v.v.
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const update = { ...req.body };
    delete update.stock; // Inventory is updated exclusively via /api/inventory.
    delete update._id;
    delete update.id; // không cho đổi id số
    const product = await Product.findOneAndUpdate({ id: parseInt(req.params.id) }, update, { new: true });
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// Xoá món (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({ id: parseInt(req.params.id) });
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    res.json({ message: 'Đã xoá sản phẩm.', id: product.id });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

module.exports = router;
