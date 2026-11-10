const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, default: '' },
  openHours: { type: String, default: '07:00 - 22:00' },
  active: { type: Boolean, default: true },
  lat: { type: Number, min: -90, max: 90 },
  lng: { type: Number, min: -180, max: 180 }
}, { timestamps: true });

module.exports = mongoose.model('Branch', branchSchema);
