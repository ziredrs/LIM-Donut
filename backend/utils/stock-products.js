// Product.stock is a legacy value. Public availability is derived from active branch inventories.
function stockProductsPipeline() {
  return [
    { $lookup: { from: 'branchinventories', localField: 'id', foreignField: 'productId', as: 'inventory' } },
    { $lookup: { from: 'branches', localField: 'inventory.branchId', foreignField: '_id', as: 'branches' } },
    { $set: { stock: { $sum: { $map: {
      input: { $filter: { input: '$inventory', as: 'row', cond: { $in: ['$$row.branchId', { $map: {
        input: { $filter: { input: '$branches', as: 'branch', cond: { $eq: ['$$branch.active', true] } } },
        as: 'active', in: '$$active._id'
      } }] } } }, as: 'row', in: '$$row.stock'
    } } } } },
    { $unset: ['inventory', 'branches'] },
    // Combo boxes consume constituent donuts, not a separate box stock.
    { $lookup: {
      from: 'branchinventories', let: { product: '$id' }, as: 'comboStock', pipeline: [
        { $match: { $expr: { $and: [ { $in: ['$$product', [99, 100]] }, { $not: [{ $in: ['$productId', [99, 100]] }] } ] } } },
        { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
        { $match: { 'branch.active': true } },
        { $group: { _id: '$branchId', stock: { $sum: '$stock' } } },
        { $project: { stock: { $floor: { $divide: ['$stock', { $cond: [{ $eq: ['$$product', 99] }, 4, 6] }] } } } }
      ]
    } },
    { $set: { stock: { $cond: [{ $in: ['$id', [99, 100]] }, { $sum: '$comboStock.stock' }, '$stock'] } } },
    { $unset: 'comboStock' }
  ];
}
module.exports = { stockProductsPipeline };
