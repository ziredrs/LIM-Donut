const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  productId: { type: Number, required: true },
  stock: { type: Number, min: 0, required: true, validate: Number.isSafeInteger }
}, { timestamps: true });
schema.index({ branchId: 1, productId: 1 }, { unique: true });
module.exports = mongoose.model('BranchInventory', schema);
