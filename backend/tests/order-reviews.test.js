jest.mock('../models/Order', () => ({ findById: jest.fn(), collection: { name: 'orders' } }));
jest.mock('../models/Product', () => ({ updateOne: jest.fn() }));
jest.mock('../utils/order-review', () => ({ saveOrderReviews: jest.fn(async (order, rows) => rows) }));
jest.mock('../models/Review', () => {
  const Review = jest.fn().mockImplementation(data => ({ ...data, save: jest.fn().mockResolvedValue() }));
  Review.aggregate = jest.fn().mockResolvedValue([]);
  return Review;
});
const express = require('express');
const request = require('supertest');
const Order = require('../models/Order');
const Review = require('../models/Review');
const app = express();
app.use(express.json());
app.use('/reviews', require('../routes/reviews'));
const orderId = '000000000000000000000001';
const payload = { orderId, productId: 25, rating: 5, comment: 'Great', phone: '0901234567', name: 'Test' };
beforeEach(() => {
  jest.clearAllMocks();
  Order.findById.mockResolvedValue({ _id: orderId, status: 'Hoàn thành', customerInfo: { phone: payload.phone, name: payload.name }, items: [{ id: '25_options' }] });
});
test('completed guest purchase stores review against original order and product', async () => {
  const res = await request(app).post('/reviews').send(payload);
  expect(res.status).toBe(201);
  expect(require('../utils/order-review').saveOrderReviews).toHaveBeenCalledWith(expect.any(Object), [expect.objectContaining({ orderId, productId: 25, userName: 'Test' })]);
});
test('cannot review another product or use a different guest phone', async () => {
  expect((await request(app).post('/reviews').send({ ...payload, productId: 26 })).status).toBe(400);
  expect((await request(app).post('/reviews').send({ ...payload, phone: '0900000000' })).status).toBe(403);
  expect(Review).not.toHaveBeenCalled();
});
test('cannot create a review without a completed purchase reference', async () => {
  const { orderId, ...withoutOrder } = payload;
  expect((await request(app).post('/reviews').send(withoutOrder)).status).toBe(400);
  expect(Review).not.toHaveBeenCalled();
});
test.each(['/reviews/25', '/reviews/25/summary'])('public endpoint %s filters by completed purchased product', async url => {
  expect((await request(app).get(url)).status).toBe(200);
  const pipeline = Review.aggregate.mock.calls[0][0];
  expect(pipeline[0]).toEqual({ $match: { productId: 25, $or: [{ orderId: { $type: 'objectId' } }, { isDemo: true }] } });
  expect(pipeline).toContainEqual(expect.objectContaining({ $lookup: expect.objectContaining({ from: 'orders', localField: 'orderId' }) }));
  expect(pipeline).toContainEqual({ $match: { $or: [{ isDemo: true }, expect.objectContaining({ 'purchase.status': 'Hoàn thành', $expr: expect.any(Object) })] } });
});
test.each(['Đã đặt', 'Đã xác nhận', 'Đang chuẩn bị', 'Đang giao', 'Đã hủy'])('cannot review an order with status %s', async status => {
  const order = await Order.findById();
  Order.findById.mockResolvedValue({ ...order, status });
  expect((await request(app).post('/reviews').send(payload)).status).toBe(400);
  expect(Review).not.toHaveBeenCalled();
});
test.each([0, 6, 2.5])('rejects invalid rating %s', async rating => {
  expect((await request(app).post('/reviews').send({ ...payload, rating })).status).toBe(400);
  expect(Review).not.toHaveBeenCalled();
});
test('accepts multiple purchased products in one submission', async () => {
  const order = await Order.findById();
  Order.findById.mockResolvedValue({ ...order, items: [{ productId: 25 }, { productId: 26 }] });
  const res = await request(app).post('/reviews').send({ ...payload, reviews: [{ productId: 25, rating: 5, comment: 'Good' }, { productId: 26, rating: 4, comment: 'Nice' }] });
  expect(res.status).toBe(201);
  expect(res.body).toHaveLength(2);
});
