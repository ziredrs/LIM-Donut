jest.mock('../models/Order', () => ({ updateOne: jest.fn() }));
jest.mock('../models/BranchInventory', () => ({ updateOne: jest.fn() }));
jest.mock('../models/OrderCancelOtp', () => ({ findOneAndDelete: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../models/Voucher', () => ({ updateOne: jest.fn() }));
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Inventory = require('../models/BranchInventory');
const Otp = require('../models/OrderCancelOtp');
const User = require('../models/User');
const Voucher = require('../models/Voucher');
const { saveOrderStatus } = require('../utils/order-status');
let session;
beforeEach(() => {
  jest.clearAllMocks();
  session = { withTransaction: jest.fn(fn => fn()), endSession: jest.fn() };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
  Order.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Inventory.updateOne.mockResolvedValue({ modifiedCount: 1 });
  User.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ starsHistory: [] }) });
  User.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Voucher.updateOne.mockResolvedValue({ modifiedCount: 1 });
});
afterEach(() => jest.restoreAllMocks());
test('unprepared cancellation restores exactly the original branch', async () => {
  const order = { _id: 'order', status: 'Đã hủy', branchId: 'A', inventoryDeducted: true, items: [{ id: '12_a', quantity: 2 }] };
  await saveOrderStatus(order, 'Đã đặt');
  expect(Inventory.updateOne).toHaveBeenCalledWith({ branchId: 'A', productId: 12 }, { $inc: { stock: 2 } }, { session, upsert: true });
  expect(order.inventoryDeducted).toBe(false);
});
test('concurrent cancellation cannot restore stock twice', async () => {
  Order.updateOne.mockResolvedValue({ modifiedCount: 0 });
  await expect(saveOrderStatus({ _id: 'order', status: 'Đã hủy', branchId: 'A', inventoryDeducted: true }, 'Đã đặt')).rejects.toMatchObject({ status: 409 });
  expect(Inventory.updateOne).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalled();
});
test('prepared stock and legacy orders are not automatically returned', async () => {
  await saveOrderStatus({ _id: 'order', status: 'Đã hủy', branchId: 'A', inventoryDeducted: true }, 'Đang chuẩn bị');
  await saveOrderStatus({ _id: 'legacy', status: 'Đã hủy' }, 'Đã đặt');
  expect(Inventory.updateOne).not.toHaveBeenCalled();
});

test('already consumed or expired OTP cannot change order status', async () => {
  Otp.findOneAndDelete.mockResolvedValue(null);
  await expect(saveOrderStatus({ _id: 'order', customerInfo: { phone: '0901234567' }, status: 'Đã hủy' }, 'Đã đặt', { _id: 'proof', digest: 'hash' })).rejects.toMatchObject({ status: 400 });
  expect(Order.updateOne).not.toHaveBeenCalled();
  expect(Inventory.updateOne).not.toHaveBeenCalled();
});

test('OTP consumption and cancellation use same transaction', async () => {
  Otp.findOneAndDelete.mockResolvedValue({ _id: 'proof' });
  await saveOrderStatus({ _id: 'order', customerInfo: { phone: '0901234567' }, status: 'Đã hủy' }, 'Đã đặt', { _id: 'proof', digest: 'hash' });
  expect(Otp.findOneAndDelete).toHaveBeenCalledWith(expect.objectContaining({ digest: 'hash', ready: true, attempts: { $lte: 5 }, expiresAt: { $gt: expect.any(Date) } }), { session });
  expect(Order.updateOne.mock.calls[0][2]).toEqual({ session });
});
test('cancellation returns voucher usage and spent Stars in same transaction, retains paid deposit', async () => {
  const order = { _id: 'order', orderId: 'DH-test', userId: 'user', status: 'Đã hủy', starsUsed: 500,
    voucherCode: 'CODE', voucherConsumed: true, depositPaid: true, depositAmount: 30000,
    cancellation: { reason: 'Đặt nhầm đơn', note: 'test', at: new Date() } };
  await saveOrderStatus(order, 'Đã đặt');
  expect(Voucher.updateOne).toHaveBeenCalledWith({ code: 'CODE', usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
  expect(User.updateOne).toHaveBeenCalledWith({ _id: 'user' }, expect.objectContaining({ $inc: { stars: 500 } }), { session });
  expect(order.cancellation).toMatchObject({ starsReturned: 500, voucherReturned: true, depositForfeited: 30000, processedAt: expect.any(Date) });
});
test('retry after status changed does not return voucher or Stars twice', async () => {
  Order.updateOne.mockResolvedValue({ modifiedCount: 0 });
  await expect(saveOrderStatus({ _id: 'order', status: 'Đã hủy', userId: 'user', starsUsed: 50, voucherCode: 'CODE' }, 'Đã đặt')).rejects.toMatchObject({ status: 409 });
  expect(User.updateOne).not.toHaveBeenCalled(); expect(Voucher.updateOne).not.toHaveBeenCalled();
});
test('legacy Stars are restored from the actual debit history', async () => {
  User.findById.mockReturnValue({ session: jest.fn().mockResolvedValue({ starsHistory: [{ amount: -150, reason: 'Dùng Star cho đơn DH-old' }] }) });
  const order = { _id: 'order', orderId: 'DH-old', status: 'Đã hủy', userId: 'user' };
  await saveOrderStatus(order, 'Đã đặt');
  expect(order.cancellation.starsReturned).toBe(150);
});
test('settlement failure propagates so transaction cannot commit partial refunds', async () => {
  Voucher.updateOne.mockRejectedValue(new Error('voucher failed'));
  const order = { _id: 'order', status: 'Đã hủy', voucherCode: 'CODE', userId: 'user', starsUsed: 50 };
  await expect(saveOrderStatus(order, 'Đã đặt')).rejects.toThrow('voucher failed');
  expect(User.updateOne).not.toHaveBeenCalled(); expect(session.endSession).toHaveBeenCalled();
});
test('unpaid deposit is not recorded as forfeited and paid order is flagged for payment review', async () => {
  const order = { _id: 'order', status: 'Đã hủy', depositAmount: 50000 };
  await saveOrderStatus(order, 'Đã đặt');
  expect(order.cancellation.depositForfeited).toBe(0);
  const prepaid = { _id: 'paid', status: 'Đã hủy', paymentStatus: 'paid' };
  await saveOrderStatus(prepaid, 'Đã đặt');
  expect(prepaid.cancellation.paymentReviewRequired).toBe(true);
});
