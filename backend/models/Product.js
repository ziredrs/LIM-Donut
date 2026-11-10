const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Giữ id số cũ để không vỡ liên kết với favorites/giỏ hàng/review đang lưu theo id số
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: String, required: true },
  basePrice: { type: String },
  rating: { type: Number, default: 5 },
  reviews: { type: String, default: '0' },
  image: { type: String, default: '' },
  categories: [{ type: String }],
  toppings: [{ name: String, price: String }],
  labels: [{ type: String }],
  dietary: [{ type: String }],
  nutrition: {
    calories: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    protein: { type: Number, default: 0 }
  },
  allergens: [{ type: String }],
  sold: { type: Number, default: 0 },
  stock: { type: Number, default: 0 }, // Legacy only; live stock is derived from BranchInventory.
  flashSale: {
    type: {
      discountPercent: Number,
      dayOfWeek: Number,
      startHour: Number,
      endHour: Number
    },
    default: null
  }
});

module.exports = mongoose.model('Product', productSchema);
