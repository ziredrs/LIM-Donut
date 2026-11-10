require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const { randomInt } = require('crypto');
const Product = require('../models/Product');
const Review = require('../models/Review');
const batch = 'classroom-reviews-2026-11-09';
const names = ['Minh Anh', 'Ngọc Linh', 'Thanh Bình', 'Khánh An', 'Thu Hà', 'Hoàng Nam', 'Bảo Ngọc', 'Quỳnh Chi'];
const comments = [
  'Bánh mềm, vị ngọt vừa phải. Ăn cùng trà rất hợp!',
  'Trang trí đẹp mắt, đóng gói gọn gàng. Mình rất thích hương vị này.',
  'Phần sốt thơm, bánh không bị khô. Sẽ thử thêm vị khác lần sau.',
  'Bánh ngon, topping khá nhiều. Nếu bớt ngọt một chút nữa thì hợp khẩu vị mình hơn.',
  'Hương vị hài hòa, nhìn ngoài cũng đẹp như hình.',
  'Cả nhà đều thích, nhất là lớp phủ bên trên. Rất đáng thử!',
  'Bánh thơm và mềm, kích thước vừa ăn. Đóng gói cẩn thận.',
  'Màu sắc xinh, vị bánh ổn. Mình sẽ ủng hộ tiếp.'
];
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  if (await Review.countDocuments({ seedBatch: batch })) throw Error('Batch already exists; no reviews added.');
  const products = await Product.find({}, { id: 1, name: 1 }).lean();
  for (let i = products.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [products[i], products[j]] = [products[j], products[i]];
  }
  const selected = products.slice(0, Math.round(products.length * .3));
  const rows = selected.flatMap((product, i) => Array.from({ length: 1 + i % 3 }, (_, j) => ({
    productId: product.id, userName: names[(i + j) % names.length],
    rating: (i + j) % 4 === 0 ? 4 : 5, comment: comments[(i * 2 + j) % comments.length],
    isDemo: true, seedBatch: batch, orderId: null,
    createdAt: new Date(Date.now() - (i * 3 + j + 1) * 3600000)
  })));
  if (rows.length) await Review.insertMany(rows);
  const saved = await Review.find({ seedBatch: batch }).lean();
  const counts = selected.map(product => saved.filter(review => review.productId === product.id).length);
  if (saved.length !== rows.length || counts.some(count => count < 1 || count > 3)) throw Error('Verification failed.');
  console.log(JSON.stringify({ totalProducts: products.length, selectedProducts: selected.length, insertedReviews: saved.length, productIds: selected.map(product => product.id), batch }));
}
main().catch(err => { console.error(err.message.replace(/mongodb[^\s]*/g, '[redacted]')); process.exitCode = 1; }).finally(() => mongoose.disconnect());
