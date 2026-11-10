jest.mock('../models/Order', () => ({ findById: jest.fn() }));
jest.mock('../models/OrderCancelOtp', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn() }));
jest.mock('../utils/order-status', () => ({ saveOrderStatus: jest.fn() }));
jest.mock('../middleware/rateLimiters', () => ({ otpLimiter: (req, res, next) => next(), cancelOtpVerifyLimiter: (req, res, next) => next() }));
jest.mock('../utils/cancel-otp', () => ({ ...jest.requireActual('../utils/cancel-otp'), sendCancelSms: jest.fn() }));
const express = require('express');
const request = require('supertest');
const Order = require('../models/Order');
const Otp = require('../models/OrderCancelOtp');
const { saveOrderStatus } = require('../utils/order-status');
const { otpDigest, sendCancelSms } = require('../utils/cancel-otp');
const app = express(); app.use(express.json()); app.use('/orders', require('../routes/orders'));
const id = '000000000000000000000001';
beforeEach(() => {
  jest.clearAllMocks(); process.env.JWT_SECRET = 'test-only-secret';
  delete process.env.CANCEL_OTP_DEMO;
  process.env.SMS_OTP_URL = 'https://sms.example.test'; process.env.SMS_OTP_TOKEN = 'test';
  Order.findById.mockResolvedValue({ _id: id, status: 'Đã đặt', orderType: 'small', customerInfo: { phone: '0901234567', name: 'Test' }, statusHistory: [] });
  Otp.findOneAndUpdate.mockResolvedValue(null); Otp.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Otp.deleteOne.mockResolvedValue({ deletedCount: 1 }); sendCancelSms.mockResolvedValue();
  saveOrderStatus.mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());
test.each(['', '123', '12345', 'abcd'])('unauthenticated cancellation rejects invalid OTP %s', async otp => {
  const res = await request(app).patch(`/orders/${id}/cancel`).send({ reason: 'Đặt nhầm đơn', otp });
  expect(res.status).toBe(400); expect(saveOrderStatus).not.toHaveBeenCalled();
});
test('guest cannot bypass OTP by leaving it out', async () => {
  expect((await request(app).patch(`/orders/${id}/cancel`).send({})).status).toBe(400);
  expect(saveOrderStatus).not.toHaveBeenCalled();
});
test('wrong, expired or locked challenge does not cancel order', async () => {
  const res = await request(app).patch(`/orders/${id}/cancel`).send({ reason: 'Đặt nhầm đơn', otp: '0123' });
  expect(res.status).toBe(400); expect(saveOrderStatus).not.toHaveBeenCalled();
});
test('valid four-digit OTP passes proof into atomic cancellation', async () => {
  const proof = { _id: 'proof', digest: otpDigest(id, '0901234567', '0123') };
  Otp.findOneAndUpdate.mockResolvedValue(proof);
  const res = await request(app).patch(`/orders/${id}/cancel`).send({ reason: 'Đặt nhầm đơn', otp: '0123' });
  expect(res.status).toBe(200);
  expect(saveOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'Đã hủy', cancellation: { reason: 'Đặt nhầm đơn', note: '', at: expect.any(Date) }, statusHistory: [{ status: 'Đã hủy', at: expect.any(Date) }] }), 'Đã đặt', proof);
  expect(Otp.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ ready: true, attempts: { $lt: 5 }, expiresAt: { $gt: expect.any(Date) } });
});
test('SMS destination is taken from order and raw code is never returned', async () => {
  const res = await request(app).post(`/orders/${id}/cancel-otp`).send({ phone: '0901234567', name: 'Test' });
  expect(res.status).toBe(200); expect(res.body).not.toHaveProperty('otp'); expect(res.body).not.toHaveProperty('code');
  expect(sendCancelSms).toHaveBeenCalledWith('0901234567', expect.stringMatching(/^\d{4}$/));
});
test('phone substitution cannot send OTP to another recipient', async () => {
  const res = await request(app).post(`/orders/${id}/cancel-otp`).send({ phone: '0909999999', name: 'Test' });
  expect(res.status).toBe(400); expect(sendCancelSms).not.toHaveBeenCalled();
});
test.each([{ reason: 'Unknown' }, { reason: 'Lý do khác', note: ' ' }, { reason: 'Đặt nhầm đơn', note: 'x'.repeat(1001) }])('invalid cancellation feedback is rejected before any settlement', async feedback => {
  const res = await request(app).patch(`/orders/${id}/cancel`).send({ otp: '0123', ...feedback });
  expect(res.status).toBe(400);
  expect(saveOrderStatus).not.toHaveBeenCalled();
});
test('already cancelled order never verifies OTP or runs settlement again', async () => {
  Order.findById.mockResolvedValue({ status: 'Đã hủy' });
  expect((await request(app).patch(`/orders/${id}/cancel`).send({ otp: '0123', reason: 'Đặt nhầm đơn' })).status).toBe(403);
  expect(Otp.findOneAndUpdate).not.toHaveBeenCalled();
  expect(saveOrderStatus).not.toHaveBeenCalled();
});
test('localhost demo returns four digits including leading zero and never calls SMS gateway', async () => {
  process.env.CANCEL_OTP_DEMO = 'true';
  jest.spyOn(require('crypto'), 'randomInt').mockReturnValue(7);
  const res = await request(app).post(`/orders/${id}/cancel-otp`).set('Host', 'localhost').set('Origin', 'http://localhost:4200').send({ phone: '0901234567', name: 'Test' });
  expect(res.status).toBe(200); expect(res.body).toMatchObject({ demoCode: '0007', isDemo: true, expiresIn: 300 });
  expect(sendCancelSms).not.toHaveBeenCalled();
  expect(Otp.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ isDemo: true, ready: false, digest: otpDigest(id, '0901234567', '0007') });
  expect(Otp.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('code');
});
test('demo flag cannot expose a code through a public hostname', async () => {
  process.env.CANCEL_OTP_DEMO = 'true';
  const res = await request(app).post(`/orders/${id}/cancel-otp`).set('Host', 'website.example').send({ phone: '0901234567', name: 'Test' });
  expect(res.status).toBe(403); expect(res.body.demoCode).toBeUndefined(); expect(sendCancelSms).not.toHaveBeenCalled();
});
test('production rejects demo dispatch even on localhost', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; process.env.CANCEL_OTP_DEMO = 'true';
  try {
    const res = await request(app).post(`/orders/${id}/cancel-otp`).set('Host', 'localhost').send({ phone: '0901234567', name: 'Test' });
    expect(res.status).toBe(403); expect(res.body.demoCode).toBeUndefined(); expect(sendCancelSms).not.toHaveBeenCalled();
  } finally { process.env.NODE_ENV = previous; }
});
test('non-demo verification excludes challenges created in demo mode', async () => {
  await request(app).patch(`/orders/${id}/cancel`).send({ reason: 'Đặt nhầm đơn', otp: '0007' });
  expect(Otp.findOneAndUpdate.mock.calls[0][0].isDemo).toEqual({ $ne: true });
});
