const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu OTP, vui lòng thử lại sau ít phút.' }
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Bạn gửi liên hệ quá nhiều lần, vui lòng thử lại sau ít phút.' }
});

const cancelOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Quá nhiều lần xác thực hủy đơn. Vui lòng thử lại sau.' }
});
module.exports = { authLimiter, otpLimiter, contactLimiter, cancelOtpVerifyLimiter };
