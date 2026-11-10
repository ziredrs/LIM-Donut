jest.mock('../models/BranchInventory', () => ({ updateOne: jest.fn() }));
jest.mock('../models/Product', () => ({ updateOne: jest.fn() }));
const Inventory = require('../models/BranchInventory');
const Product = require('../models/Product');
const { reserveInventory } = require('../utils/reserve-inventory');
const { inventoryQuantities } = require('../utils/inventory');

beforeEach(() => jest.clearAllMocks());
test('combines repeated products across options and combo contents', () => {
  const quantities = inventoryQuantities([
    { id: '12_a', quantity: 2 }, { id: '12_b', quantity: 1 },
    { id: '99_box', quantity: 2, options: { boxDonuts: [12, 12, 34, 34].map(productId => ({ productId })) } }
  ]);
  expect([...quantities]).toEqual([[12, 7], [34, 4]]);
});
test.each([0, -1, 1.5, 'bad'])('rejects invalid quantity %s', quantity => {
  expect(() => inventoryQuantities([{ id: '12_a', quantity }])).toThrow();
});
test('rejects incomplete combos', () => {
  expect(() => inventoryQuantities([{ id: '99_box', quantity: 1 }])).toThrow();
});
test('reserves only requested branch atomically within provided session', async () => {
  Inventory.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Product.updateOne.mockResolvedValue({ modifiedCount: 1 });
  const session = {};
  await reserveInventory('branch-A', [{ id: '12_a', quantity: 3 }], session);
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: 'branch-A', productId: 12, stock: { $gte: 3 } }, { $inc: { stock: -3 } }, { session });
});
test('missing/insufficient inventory throws 409 instead of clamping to zero', async () => {
  Inventory.updateOne.mockResolvedValue({ modifiedCount: 0 });
  await expect(reserveInventory('branch-B', [{ id: '12_a', quantity: 3 }], {})).rejects.toMatchObject({ status: 409 });
  expect(Product.updateOne).not.toHaveBeenCalled();
});
