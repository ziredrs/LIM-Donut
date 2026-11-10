// Apply the reviewed local snapshot once. Never overwrite existing branch inventories.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Inventory = require('../models/BranchInventory');

async function main() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../backups/pending-stock-split.json'), 'utf8'));
  if (snapshot.branches.length !== 2) throw Error('Snapshot must contain two active branches.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  await Inventory.createCollection();
  await Inventory.collection.createIndex({ branchId: 1, productId: 1 }, { unique: true });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const db = mongoose.connection.db;
      if (await Inventory.countDocuments({}).session(session)) throw Error('Branch inventories already exist. No changes applied.');
      const branches = await db.collection('branches').find({ active: true }, { session }).sort({ name: 1, _id: 1 }).toArray();
      if (branches.length !== 2 || branches.some((b, i) => String(b._id) !== snapshot.branches[i]._id)) throw Error('Active branches changed.');
      const products = await db.collection('products').find({ id: { $nin: [99, 100] } }, { session }).sort({ id: 1 }).toArray();
      if (products.length !== snapshot.products.length || products.some((p, i) => p.id !== snapshot.products[i].id || p.stock !== snapshot.products[i].stock)) throw Error('Legacy stock changed since snapshot.');
      const rows = products.flatMap(product => branches.map((branch, i) => ({
        branchId: branch._id, productId: product.id,
        stock: i === 0 ? Math.ceil(product.stock / 2) : Math.floor(product.stock / 2)
      })));
      await Inventory.insertMany(rows, { session });
    });
  } finally { await session.endSession(); }
  const totals = await Inventory.aggregate([{ $group: { _id: '$branchId', stock: { $sum: '$stock' }, products: { $sum: 1 } } }]);
  const total = totals.reduce((sum, row) => sum + row.stock, 0);
  const expected = snapshot.products.reduce((sum, p) => sum + p.stock, 0);
  if (total !== expected) throw Error('Post-allocation total mismatch.');
  console.log(JSON.stringify({ total, branches: totals }, null, 2));
}
main().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
