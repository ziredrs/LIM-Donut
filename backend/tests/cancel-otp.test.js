const { otpDigest, canCancelOrder, sendCancelSms, localDemoEnabled } = require('../utils/cancel-otp');
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

test('OTP digest is bound to the order, phone and code; leading zero preserved', () => {
  process.env.JWT_SECRET = 'test-only-secret';
  const digest = otpDigest('order1', '0901234567', '0123');
  expect(digest).toHaveLength(64);
  expect(digest).not.toContain('0123');
  expect(otpDigest('order1', '0901234567', '0123')).toBe(digest);
  expect(otpDigest('order2', '0901234567', '0123')).not.toBe(digest);
  expect(otpDigest('order1', '0901234568', '0123')).not.toBe(digest);
});
test('processing cancellation does not depend on the custom deadline', () => {
  expect(canCancelOrder({ status: 'Đã đặt', orderType: 'small' })).toBe(true);
  expect(canCancelOrder({ status: 'Đã xác nhận', orderType: 'small' })).toBe(false);
  expect(canCancelOrder({ status: 'Đã hủy', orderType: 'custom', cancelDeadline: '2099-01-01' })).toBe(false);
  expect(canCancelOrder({ status: 'Đã đặt', orderType: 'custom', cancelDeadline: '2020-01-01' })).toBe(true);
});

test.each(['Đang xử lý', 'Đã đặt'])('processing status %s allows cancellation', status => {
  expect(canCancelOrder({ status, orderType: 'small' })).toBe(true);
  expect(canCancelOrder({ status, orderType: 'custom' })).toBe(true);
});
test.each(['Đã xác nhận', 'Đang chuẩn bị', 'Đã đóng gói', 'Đang giao', 'Sẵn sàng lấy', 'Hoàn thành', 'Đã hủy', 'Đã hoàn tiền', 'Giao thất bại'])('non-processing status %s blocks cancellation', status => {
  expect(canCancelOrder({ status, orderType: 'small' })).toBe(false);
  expect(canCancelOrder({ status, orderType: 'custom' })).toBe(false);
});
test('SMS is not simulated when configuration is missing', async () => {
  delete process.env.SMS_OTP_URL; delete process.env.SMS_OTP_TOKEN;
  await expect(sendCancelSms('0901234567', '0123')).rejects.toMatchObject({ status: 503 });
});
test('SMS gateway receives original phone and four-digit code', async () => {
  process.env.SMS_OTP_URL = 'https://sms.example.test/send'; process.env.SMS_OTP_TOKEN = 'test-token';
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });
  await sendCancelSms('0901234567', '0123');
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe(process.env.SMS_OTP_URL);
  expect(JSON.parse(request.body)).toMatchObject({ to: '0901234567', code: '0123', purpose: 'order-cancellation' });
});
test('gateway failures prevent successful OTP dispatch', async () => {
  process.env.SMS_OTP_URL = 'https://sms.example.test/send'; process.env.SMS_OTP_TOKEN = 'test-token';
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false });
  await expect(sendCancelSms('0901234567', '0123')).rejects.toMatchObject({ status: 502 });
});
test('demo requires explicit flag, direct loopback request and non-production environment', () => {
  const req = { hostname: 'localhost', socket: { remoteAddress: '::1' }, headers: { origin: 'http://localhost:4200' } };
  delete process.env.CANCEL_OTP_DEMO;
  expect(localDemoEnabled(req)).toBe(false);
  process.env.CANCEL_OTP_DEMO = 'true'; process.env.NODE_ENV = 'development';
  expect(localDemoEnabled(req)).toBe(true);
  expect(localDemoEnabled({ ...req, hostname: 'website.example' })).toBe(false);
  expect(localDemoEnabled({ ...req, socket: { remoteAddress: '203.0.113.1' } })).toBe(false);
  expect(localDemoEnabled({ ...req, headers: { origin: 'https://website.example' } })).toBe(false);
  expect(localDemoEnabled({ ...req, headers: { 'x-forwarded-for': '203.0.113.1' } })).toBe(false);
  process.env.NODE_ENV = 'production';
  expect(localDemoEnabled(req)).toBe(false);
});
