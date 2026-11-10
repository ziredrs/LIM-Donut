const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Khi deploy sau proxy (Render/Railway...): để rate-limiter đọc đúng IP thật của khách
app.set('trust proxy', 1);

// Logging
app.use(morgan('dev'));

// Security
// crossOriginResourcePolicy: cho phép frontend (port khác) tải ảnh từ /uploads
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:4201').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json());
// express-mongo-sanitize không tương thích Express 5 (req.query chỉ có getter)
// → chỉ làm sạch req.body, không đụng vào req.query
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  next();
});

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Da ket noi toi MongoDB thanh cong!'))
  .catch(err => console.error('Loi ket noi MongoDB:', err));

// Route kiểm tra server
app.get('/', (req, res) => {
  res.send('LIMDonut API is running...');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/products', require('./routes/products'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/vouchers', require('./routes/vouchers'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/blog', require('./routes/blog'));
app.use('/api/users', require('./routes/users'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/delivery-location', require('./routes/delivery-location'));

// Serve ảnh đã upload
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// 404 cho API routes không khớp
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Không tìm thấy API endpoint.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: 'Đã có lỗi xảy ra ở server.', error: err.message });
});

// Lắng nghe server
app.listen(PORT, () => {
  console.log(`Server dang chay tai: http://localhost:${PORT}`);

  // Self-ping mỗi 14 phút để Render free tier không ngủ
  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
      fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {});
    }, 14 * 60 * 1000);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
