jest.mock('../models/Order', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/Branch', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../models/BranchInventory', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const Inventory = require('../models/BranchInventory');
const { shippingFee, previousFee, snapshot } = require('../utils/delivery-change');
const app = express(); app.use(express.json()); app.use('/orders/:id/delivery-change', require('../routes/delivery-change'));
const id = '000000000000000000000001', a = '000000000000000000000002', b = '000000000000000000000003';
const identity = { phone: '0901234567', name: 'Test' };
let current, branches, session;
beforeEach(() => {
  jest.clearAllMocks(); process.env.JWT_SECRET = 'test-secret';
  delete process.env.GOOGLE_MAPS_API_KEY;
  current = { _id: id, status: 'Đã đặt', orderId: 'DH-test', branchId: a, inventoryDeducted: true, deliveryMethod: 'delivery',
    customerInfo: { ...identity, address: 'Old address' }, items: [{ id: '25_options', price: 50000, quantity: 1 }],
    totalAmount: 70000, shippingFee: 20000, paymentStatus: 'pending', deliveryRevision: 0 };
  branches = [{ _id: a, name: 'A', address: 'Address A', lat: 21.05, lng: 105.78, active: true },
    { _id: b, name: 'B', address: 'Address B', lat: 21.02, lng: 105.84, active: true }];
  Order.findById.mockImplementation(() => Object.assign(Promise.resolve(current), { session: () => Promise.resolve(current) }));
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Branch.find.mockResolvedValue(branches);
  Branch.findOne.mockImplementation(filter => ({ session: async () => branches.find(branch => branch._id === String(filter._id)) }));
  Inventory.findOne.mockReturnValue({ session: async () => ({ stock: 100 }) });
  Inventory.updateOne.mockResolvedValue({ modifiedCount: 1 });
  session = { withTransaction: async fn => fn(), endSession: jest.fn() };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [{ lat: '21.02', lon: '105.84', display_name: 'New Hanoi address', address: { house_number: '111' } }] });
});
afterEach(() => jest.restoreAllMocks());

test.each([
  [5, 499999, 20000], [5, 500000, 10000], [5, 2000000, 10000], [5, 2000001, 0],
  [5.01, 499999, 30000], [10, 500000, 30000], [10, 2000001, 10000],
  [10.01, 499999, 40000], [15, 500000, 30000], [15, 2000000, 30000], [15, 2000001, 20000], [15.001, 1, null]
])('Table 4: %s km / goods %s => %s', (distance, goods, expected) => expect(shippingFee(distance, goods)).toBe(expected));
test('legacy fee is inferred only when discounts and total yield a recognized fee', () => {
  expect(previousFee({ ...current, shippingFee: null })).toBe(20000);
  expect(() => previousFee({ ...current, shippingFee: null, totalAmount: 60001 })).toThrow();
});
test('quote uses server geocoding, selects nearest stocked branch, and never writes', async () => {
  const res = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'delivery', address: 'New address Hanoi', shippingFee: 0 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ branchId: b, shippingFee: 20000, totalAmount: 70000 });
  expect(Order.updateOne).not.toHaveBeenCalled(); expect(Inventory.updateOne).not.toHaveBeenCalled();
});
test('beyond 15 km only offers store pickup', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [{ lat: '10', lon: '106', address: { house_number: '111' } }] });
  const res = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'delivery', address: 'Far address' });
  expect(res.status).toBe(422); expect(res.body.pickupOnly).toBe(true); expect(Order.updateOne).not.toHaveBeenCalled();
});
test('pickup quote removes delivery fee and confirm atomically transfers reserved stock', async () => {
  const quoted = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'pickup', branchId: b });
  expect(quoted.status).toBe(200); expect(quoted.body.totalAmount).toBe(50000);
  expect(Order.updateOne).not.toHaveBeenCalled();
  const confirmed = await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: quoted.body.token });
  expect(confirmed.status).toBe(200);
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: b, productId: 25, stock: { $gte: 1 } }, { $inc: { stock: -1 } }, { session });
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: a, productId: 25 }, { $inc: { stock: 1 } }, { session, upsert: true });
  expect(Order.updateOne.mock.calls[0][1]).toMatchObject({ $set: { deliveryMethod: 'pickup', shippingFee: 0, totalAmount: 50000 }, $inc: { deliveryRevision: 1 } });
  expect(session.endSession).toHaveBeenCalled();
});
test('same signed confirmation cannot move stock twice', async () => {
  const quoted = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'pickup', branchId: b });
  current = { ...current, deliveryRevision: 1 };
  const res = await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: quoted.body.token });
  expect(res.status).toBe(409); expect(Inventory.updateOne).not.toHaveBeenCalled();
});
test('invalid signature cannot change fees or address', async () => {
  expect((await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: 'fake' })).status).toBe(400);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
test('cannot change another customer order or a confirmed order', async () => {
  expect((await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, phone: 'other', deliveryMethod: 'pickup', branchId: b })).status).toBe(403);
  current.status = 'Đã xác nhận';
  expect((await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'pickup', branchId: b })).status).toBe(409);
});
test('inventory shortage or branch closure after quote prevents confirmation', async () => {
  const quoted = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'pickup', branchId: b });
  Inventory.findOne.mockReturnValue({ session: async () => ({ stock: 0 }) });
  expect((await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: quoted.body.token })).status).toBe(409);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
test('paid orders with changed totals need reconciliation instead of silently rewriting payment', async () => {
  current.paymentStatus = 'paid';
  expect((await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'pickup', branchId: b })).status).toBe(409);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
test('order snapshot changes with address, payment or revision', () => {
  expect(snapshot(current)).not.toBe(snapshot({ ...current, paymentStatus: 'paid' }));
  expect(snapshot(current)).not.toBe(snapshot({ ...current, deliveryRevision: 1 }));
});
test('imprecise geocoding must not force pickup or claim outside 15 km', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [{ lat: '10', lon: '106', display_name: 'Wrong ward centroid', address: { suburb: 'Nghia Tan' } }] });
  const res = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'delivery', address: '111A11 Nghĩa Tân' });
  expect(res.status).toBe(422); expect(res.body.pickupOnly).toBe(false);
});
test('Google driving distance decides service range, not straight-line distance', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
  fetch.mockImplementation(async url => String(url).includes('geocode') ? {
    ok: true, json: async () => ({ status: 'OK', results: [{ geometry: { location: { lat: 21.02, lng: 105.84 }, location_type: 'ROOFTOP' }, formatted_address: 'New address' }] })
  } : { ok: true, json: async () => ({ routes: [{ distanceMeters: 16000 }] }) });
  const res = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'delivery', address: '111A11 Nghĩa Tân' });
  expect(res.status).toBe(422); expect(res.body.pickupOnly).toBe(true);
});
test('street approximation preserves the house address and needs explicit confirmation', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => [{ lat: '21.02', lon: '105.84', display_name: 'Phố Nghĩa Tân, Hà Nội', address: { road: 'Phố Nghĩa Tân', city: 'Hà Nội' } }] });
  const address = '111A11 Nghĩa Tân, Nghĩa Đô, Hà Nội';
  const quote = await request(app).post(`/orders/${id}/delivery-change/quote`).send({ ...identity, deliveryMethod: 'delivery', address });
  expect(quote.status).toBe(200);
  expect(quote.body).toMatchObject({ address, locationPrecision: 'street' });
  expect((await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: quote.body.token })).status).toBe(400);
  expect(Order.updateOne).not.toHaveBeenCalled();
  expect((await request(app).post(`/orders/${id}/delivery-change/confirm`).send({ ...identity, token: quote.body.token, locationConfirmed: true })).status).toBe(200);
});
