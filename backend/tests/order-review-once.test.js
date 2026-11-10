jest.mock('../models/Order', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../models/Review', () => ({ exists: jest.fn(), insertMany: jest.fn(), distinct: jest.fn() }));
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { saveOrderReviews, withReviewState } = require('../utils/order-review');
let session;
beforeEach(() => {
  jest.clearAllMocks();
  session = { withTransaction: jest.fn(async fn => fn()), endSession: jest.fn() };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session);
  Order.findOneAndUpdate.mockResolvedValue({ _id: 'order' });
  Review.exists.mockReturnValue({ session: jest.fn().mockResolvedValue(null) });
  Review.insertMany.mockImplementation(async rows => rows);
});
afterEach(() => jest.restoreAllMocks());
test('claims completed order and saves all products in the same transaction', async () => {
  const rows = [{ productId: 1 }, { productId: 2 }];
  expect(await saveOrderReviews({ _id: 'order' }, rows)).toEqual(rows);
  expect(Order.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'order', status: 'Hoàn thành', reviewedAt: null }, { $set: { reviewedAt: expect.any(Date) } }, { session, new: true });
  expect(Review.insertMany).toHaveBeenCalledWith(rows, { session });
  expect(session.endSession).toHaveBeenCalled();
});
test('repeat or concurrently claimed order cannot write another review', async () => {
  Order.findOneAndUpdate.mockResolvedValue(null);
  await expect(saveOrderReviews({ _id: 'order' }, [{}])).rejects.toMatchObject({ status: 409 });
  expect(Review.insertMany).not.toHaveBeenCalled();
});
test('old order with existing review is also blocked', async () => {
  Review.exists.mockReturnValue({ session: jest.fn().mockResolvedValue({ _id: 'existing' }) });
  await expect(saveOrderReviews({ _id: 'order' }, [{}])).rejects.toMatchObject({ status: 409 });
  expect(Review.insertMany).not.toHaveBeenCalled();
});
test('review insertion failure propagates through transaction and ends session', async () => {
  Review.insertMany.mockRejectedValue(new Error('write failed'));
  await expect(saveOrderReviews({ _id: 'order' }, [{}])).rejects.toThrow('write failed');
  expect(session.endSession).toHaveBeenCalled();
});
test('order response remembers historic reviews after page reload', async () => {
  Review.distinct.mockResolvedValue(['old']);
  const rows = ['old', 'new'].map(_id => ({ _id, toObject: () => ({ _id }) }));
  expect(await withReviewState(rows)).toEqual([{ _id: 'old', hasReviewed: true }, { _id: 'new', hasReviewed: false }]);
});
