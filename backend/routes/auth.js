const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiters');

const EMAIL_REGEX = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// ĐĂNG KÝ
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, referralCode } = req.body;

    if (!username || username.length < 3) {
      return res.status(400).json({ message: 'Tên đăng nhập phải có ít nhất 3 ký tự.' });
    }
    if (typeof email !== 'string' || email.length > 254 || email.split('@')[0].length > 64 || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Email không đúng định dạng.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'Email đã được sử dụng!' });

    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Tạo user mới
    user = new User({
      username,
      email,
      password: hashedPassword
    });

    // Xử lý mã giới thiệu: người GIỚI THIỆU được cộng ngay 5.000 Star
    let referralDiscount = false;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.trim().toUpperCase() });
      if (referrer) {
        user.referredBy = referrer._id;
        referralDiscount = true;
        referrer.stars = (referrer.stars || 0) + 5000;
        referrer.starsHistory.push({ amount: 5000, reason: `Giới thiệu thành viên mới ${username}`, at: new Date() });
        await referrer.save();
      }
    }

    // Tự sinh referralCode (thử lại nếu trùng unique index)
    for (let attempt = 0; attempt < 5; attempt++) {
      user.referralCode = username.slice(0, 4).toUpperCase() + Math.floor(1000 + Math.random() * 9000);
      try {
        await user.save();
        break;
      } catch (err) {
        if (err.code === 11000 && attempt < 4) continue;
        throw err;
      }
    }

    res.status(201).json({ message: 'Đăng ký thành công!', referralDiscount });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// ĐĂNG NHẬP
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Tìm user theo username
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Tên đăng nhập không đúng!' });

    // Kiểm tra mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu không đúng!' });

    // Tạo JWT Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        stars: user.stars || 0,
        role: user.role || 'customer',
        phone: user.phone || '',
        address: user.address || '',
        favorites: user.favorites || [],
        birthday: user.birthday || null,
        birthdayUpdateCount: user.birthdayUpdateCount || 0,
        referralCode: user.referralCode || ''
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// ĐỔI MẬT KHẨU (cần mật khẩu cũ)
router.post('/change-password', authLimiter, async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin!' });
    }
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Tên đăng nhập không đúng!' });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu cũ không chính xác!' });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.json({ message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// YÊU CẦU OTP RESET MẬT KHẨU
router.post('/request-reset', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Vui lòng nhập email!' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email không tồn tại trong hệ thống!' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    await user.save();
    console.log(`[OTP] Mã reset mật khẩu cho ${email}: ${otp} (hết hạn sau 5 phút)`);
    res.json({ message: 'Mã OTP đã được gửi!', otp });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// RESET MẬT KHẨU BẰNG OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin!' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email không tồn tại!' });
    if (!user.resetOtp || user.resetOtp !== otp) return res.status(400).json({ message: 'Mã OTP không đúng!' });
    if (user.resetOtpExpiry < new Date()) return res.status(400).json({ message: 'Mã OTP đã hết hạn!' });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();
    res.json({ message: 'Đặt lại mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// GET /api/auth/me — current user info with stars
const optionalAuth = require('../middleware/auth');
router.get('/me', optionalAuth, async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Chưa đăng nhập.' });
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ id: user._id, username: user.username, email: user.email, avatar: user.avatar, stars: user.stars || 0, phone: user.phone || '', address: user.address || '', favorites: user.favorites || [], birthday: user.birthday || null, birthdayUpdateCount: user.birthdayUpdateCount || 0, referralCode: user.referralCode || '' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

router.patch('/me', optionalAuth, async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Chưa đăng nhập.' });
  try {
    const { phone, address } = req.body;
    const update = {};
    if (phone !== undefined) update.phone = phone;
    if (address !== undefined) update.address = address;
    const user = await User.findByIdAndUpdate(req.userId, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ id: user._id, username: user.username, email: user.email, avatar: user.avatar, stars: user.stars || 0, phone: user.phone || '', address: user.address || '', favorites: user.favorites || [], birthday: user.birthday || null, birthdayUpdateCount: user.birthdayUpdateCount || 0, referralCode: user.referralCode || '' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// ĐỔI NGÀY SINH (tối đa 2 lần)
router.patch('/birthday', optionalAuth, async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Chưa đăng nhập.' });
  try {
    const { birthday } = req.body;
    if (!birthday || isNaN(new Date(birthday).getTime())) {
      return res.status(400).json({ message: 'Ngày sinh không hợp lệ.' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if ((user.birthdayUpdateCount || 0) >= 2) {
      return res.status(403).json({ message: 'Bạn đã đổi ngày sinh tối đa số lần cho phép.' });
    }
    user.birthday = new Date(birthday);
    user.birthdayUpdateCount = (user.birthdayUpdateCount || 0) + 1;
    await user.save();
    res.json({ birthday: user.birthday, birthdayUpdateCount: user.birthdayUpdateCount });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

router.get('/favorites', optionalAuth, async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Chưa đăng nhập.' });
  try {
    const user = await User.findById(req.userId).select('favorites');
    res.json(user?.favorites || []);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

router.post('/favorites/toggle', optionalAuth, async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Chưa đăng nhập.' });
  try {
    const { productId } = req.body;
    if (productId === undefined) return res.status(400).json({ message: 'Thiếu productId.' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const idx = (user.favorites || []).indexOf(productId);
    if (idx >= 0) {
      user.favorites.splice(idx, 1);
    } else {
      user.favorites.push(productId);
    }
    await user.save();
    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

module.exports = router;
