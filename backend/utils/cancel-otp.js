const crypto = require('crypto');

function cancelSmsConfigured() {
  return !!(process.env.SMS_OTP_URL && process.env.SMS_OTP_TOKEN);
}

function localDemoEnabled(req) {
  if (process.env.CANCEL_OTP_DEMO !== 'true' || process.env.NODE_ENV === 'production') return false;
  const loopback = value => ['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1'].includes(String(value).toLowerCase());
  if (!loopback(req.socket?.remoteAddress) || !loopback(req.hostname)) return false;
  if (req.headers?.['x-forwarded-for'] || req.headers?.forwarded) return false;
  if (req.headers?.origin) {
    try { if (!loopback(new URL(req.headers.origin).hostname)) return false; } catch { return false; }
  }
  return true;
}

function otpDigest(orderId, phone, code) {
  if (!process.env.JWT_SECRET) throw Error('Missing server secret');
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${orderId}:${phone}:${code}`).digest('hex');
}

function canCancelOrder(order) {
  return ['Đang xử lý', 'Đã đặt'].includes(order.status);
}

// Adapter contract for an authenticated SMS gateway. Never fall back to returning/logging OTPs.
async function sendCancelSms(phone, code) {
  const endpoint = process.env.SMS_OTP_URL;
  const token = process.env.SMS_OTP_TOKEN;
  if (!endpoint || !token) throw Object.assign(new Error('Chưa cấu hình dịch vụ gửi SMS OTP. Vui lòng liên hệ cửa hàng.'), { status: 503 });
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: phone, code, purpose: 'order-cancellation', expiresInSeconds: 300 }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error('SMS gateway rejected request');
  } catch {
    throw Object.assign(new Error('Không gửi được SMS OTP. Vui lòng thử lại sau.'), { status: 502 });
  }
}
module.exports = { otpDigest, canCancelOrder, sendCancelSms, cancelSmsConfigured, localDemoEnabled };
