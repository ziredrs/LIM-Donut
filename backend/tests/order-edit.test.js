jest.mock('../models/Order', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/Branch', () => ({ findOne: jest.fn() }));
jest.mock('../models/Product', () => ({ find: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/BranchInventory', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/Voucher', () => ({ findOne: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
const express = require('express'), request = require('supertest'), mongoose = require('mongoose');
const Order = require('../models/Order'), Branch = require('../models/Branch'), Product = require('../models/Product'), Inventory = require('../models/BranchInventory');
const { pickupTime, changedItems, retainedVoucher } = require('../utils/order-edit');
const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = req.headers['x-test-user']; next(); }); app.use('/orders/:id/edit', require('../routes/order-edit'));
const id = '000000000000000000000001';
const identity = { phone: '0901234567', name: 'Test' };
let current, session;
const entries = [{ sourceIndex: 0, productId: 2, quantity: 2 }];
beforeEach(() => {
  jest.clearAllMocks(); process.env.JWT_SECRET = 'test-secret';
  current = { _id: id, orderId: 'DH-test', status: 'Đã đặt', customerInfo: { ...identity, address: 'Test address', deliveryTime: 'Old time' },
    items: [{ id: '1_options', name: 'Old cake', quantity: 1, price: 25000, options: { heating: 'Có' } }],
    totalAmount: 45000, shippingFee: 20000, deliveryMethod: 'delivery', branchId: 'branch', inventoryDeducted: true,
    starsUsed: 0, paymentStatus: 'pending', deliveryRevision: 0 };
  Order.findById.mockImplementation(() => Object.assign(Promise.resolve(current), { session: async () => current }));
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Branch.findOne.mockReturnValue({ session: async () => ({ active: true }) });
  Product.find.mockReturnValue({ session: async () => [{ id: 2, name: 'New cake', price: '28.000', image: '' }] });
  Product.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Inventory.findOne.mockReturnValue({ session: async () => ({ stock: 100 }) });
  Inventory.updateOne.mockResolvedValue({ modifiedCount: 1 });
  require('../models/User').updateOne.mockResolvedValue({ modifiedCount: 1 });
  session = { withTransaction: jest.fn(async fn => fn()), endSession: jest.fn() };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
});
afterEach(() => jest.restoreAllMocks());
test.each(['06:59', '21:01', '22:00', 'bad'])('pickup time rejects %s', time => {
  expect(() => pickupTime('11/11/2099', time)).toThrow();
});
test('pickup date respects Vietnamese time and rejects invalid dates/past times', () => {
  expect(pickupTime('11/11/2099', '21:00').stamp.toISOString()).toBe('2099-11-11T14:00:00.000Z');
  expect(() => pickupTime('31/02/2099', '10:00')).toThrow();
  expect(() => pickupTime('01/01/2000', '10:00')).toThrow();
});
test('same cake keeps toppings and price; replacing cake uses database price and clears toppings', () => {
  expect(changedItems(current, [{ sourceIndex: 0, productId: 1, quantity: 2, price: 1 }], [])[0]).toMatchObject({ price: 25000, options: { heating: 'Có' }, quantity: 2 });
  expect(changedItems(current, entries, [{ id: 2, name: 'New cake', price: '28.000' }])[0]).toMatchObject({ price: 28000, options: {}, quantity: 2 });
});
test('empty, duplicate-source and invalid quantities are rejected', () => {
  expect(() => changedItems(current, [], [])).toThrow();
  expect(() => changedItems(current, [{ sourceIndex: 0, productId: 1, quantity: 0 }], [])).toThrow();
  expect(() => changedItems(current, [{ sourceIndex: 0, productId: 1, quantity: 1 }, { sourceIndex: 0, productId: 1, quantity: 1 }], [])).toThrow();
});
test('voucher preserves reserved usage while recalculating discount/minimum', () => {
  const voucher = { active: true, usedCount: 1, usageLimit: 1, type: 'percent', value: 10, minOrderValue: 50000, maxDiscount: 10000 };
  expect(retainedVoucher(voucher, 80000)).toBe(8000);
  expect(() => retainedVoucher(voucher, 40000)).toThrow();
});
test('time preview makes no change; confirmation stores time and history transactionally', async () => {
  const quote = await request(app).post(`/orders/${id}/edit/quote`).send({ ...identity, kind: 'time', date: '11/11/2099', time: '10:30' });
  expect(quote.status).toBe(200); expect(Order.updateOne).not.toHaveBeenCalled();
  expect((await request(app).post(`/orders/${id}/edit/confirm`).send({ ...identity, token: quote.body.token })).status).toBe(200);
  expect(Order.updateOne.mock.calls[0][1]).toMatchObject({ $set: { 'customerInfo.deliveryTime': 'Nhận hàng ngày 11/11/2099 - Vào lúc 10:30' }, $inc: { deliveryRevision: 1 } });
  expect(Order.updateOne.mock.calls[0][2]).toEqual({ session }); expect(Inventory.updateOne).not.toHaveBeenCalled();
});
test('item preview ignores client price and confirmation updates stock by delta', async () => {
  const quote = await request(app).post(`/orders/${id}/edit/quote`).send({ ...identity, kind: 'items', items: entries, totalAmount: 1 });
  expect(quote.status).toBe(200); expect(quote.body.totalAmount).toBe(76000); expect(Inventory.updateOne).not.toHaveBeenCalled();
  expect((await request(app).post(`/orders/${id}/edit/confirm`).send({ ...identity, token: quote.body.token })).status).toBe(200);
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: 'branch', productId: 1 }, { $inc: { stock: 1 } }, { session });
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: 'branch', productId: 2, stock: { $gte: 2 } }, { $inc: { stock: -2 } }, { session });
});
test('same token replay is rejected without repeating stock movement', async () => {
  const quote = await request(app).post(`/orders/${id}/edit/quote`).send({ ...identity, kind: 'items', items: entries });
  current.deliveryRevision = 1;
  expect((await request(app).post(`/orders/${id}/edit/confirm`).send({ ...identity, token: quote.body.token })).status).toBe(409);
  expect(Inventory.updateOne).not.toHaveBeenCalled();
});
test('changed price or insufficient stock after preview requires new preview', async () => {
  const quote = await request(app).post(`/orders/${id}/edit/quote`).send({ ...identity, kind: 'items', items: entries });
  Product.find.mockReturnValue({ session: async () => [{ id: 2, name: 'New cake', price: '30.000' }] });
  expect((await request(app).post(`/orders/${id}/edit/confirm`).send({ ...identity, token: quote.body.token })).status).toBe(409);
  expect(Inventory.updateOne).not.toHaveBeenCalled();
});
test('paid price changes, wrong customer and confirmed orders cannot be edited', async () => {
  const payload = { ...identity, kind: 'items', items: entries };
  current.paymentStatus = 'paid';
  expect((await request(app).post(`/orders/${id}/edit/quote`).send(payload)).status).toBe(409);
  expect((await request(app).post(`/orders/${id}/edit/quote`).send({ ...payload, phone: 'wrong' })).status).toBe(403);
  current.status = 'Đã xác nhận';
  expect((await request(app).post(`/orders/${id}/edit/quote`).send(payload)).status).toBe(409);
});
test('reducing order value previews and returns excess spent Stars only on confirm', async () => {
  current.userId = 'user'; current.starsUsed = 3000;
  current.items[0].price = 1000; current.items[0].quantity = 10; current.totalAmount = 27000;
  const quote = await request(app).post(`/orders/${id}/edit/quote`).set('X-Test-User', 'user').send({ kind: 'items', items: [{ sourceIndex: 0, productId: 1, quantity: 1 }] });
  expect(quote.status).toBe(200); expect(quote.body.starsReturned).toBe(2700);
  expect(require('../models/User').updateOne).not.toHaveBeenCalled();
  expect((await request(app).post(`/orders/${id}/edit/confirm`).set('X-Test-User', 'user').send({ token: quote.body.token })).status).toBe(200);
  expect(require('../models/User').updateOne).toHaveBeenCalledWith({ _id: 'user' }, expect.objectContaining({ $inc: { stars: 2700 } }), { session });
});
test('stock shortage prevents item edit without modifying order', async () => {
  Inventory.findOne.mockReturnValue({ session: async () => ({ stock: 0 }) });
  expect((await request(app).post(`/orders/${id}/edit/quote`).send({ ...identity, kind: 'items', items: entries })).status).toBe(409);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
test('forged confirmation cannot write an edit', async () => {
  expect((await request(app).post(`/orders/${id}/edit/confirm`).send({ ...identity, token: 'fake' })).status).toBe(400);
  expect(Inventory.updateOne).not.toHaveBeenCalled(); expect(Order.updateOne).not.toHaveBeenCalled();
});
