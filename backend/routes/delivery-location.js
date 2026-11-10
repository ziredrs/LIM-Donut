const router = require('express').Router();
const { geocodeAddress } = require('../utils/maps');
router.post('/', async (req, res) => {
  const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
  if (address.length < 5 || address.length > 500) return res.status(400).json({ message: 'Vui lòng nhập địa chỉ từ 5 đến 500 ký tự.' });
  try { res.json(await geocodeAddress(address)); }
  catch (err) { res.status(err.status || 503).json({ message: err.message }); }
});
module.exports = router;
