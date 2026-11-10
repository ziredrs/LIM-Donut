const CANCELLATION_REASONS = ['Muốn đổi bánh / số lượng', 'Thời gian giao không phù hợp', 'Phí giao hàng cao', 'Thay đổi địa chỉ nhận hàng', 'Đặt nhầm đơn', 'Không còn nhu cầu', 'Lý do khác'];
function cancellationDetails(reason, note) {
  if (!CANCELLATION_REASONS.includes(reason)) throw Object.assign(new Error('Vui lòng chọn lý do hủy đơn.'), { status: 400 });
  if (note != null && typeof note !== 'string') throw Object.assign(new Error('Ghi chú hủy đơn không hợp lệ.'), { status: 400 });
  const trimmed = (note || '').trim();
  if (trimmed.length > 1000 || (reason === 'Lý do khác' && !trimmed)) throw Object.assign(new Error('Vui lòng nhập ghi chú từ 1 đến 1000 ký tự cho lý do khác.'), { status: 400 });
  return { reason, note: trimmed, at: new Date() };
}
module.exports = { CANCELLATION_REASONS, cancellationDetails };
