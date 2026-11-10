# OTP hủy đơn qua tra cứu

Trang `/tra-cuu-don-hang` và `/orders` mở bước lý do rồi dialog OTP 4 số. Chỉ đơn Đã đặt/Đang xử lý được khách hủy, kể cả Custom Party; không còn xét cancelDeadline khi hủy. Đơn đã chuẩn bị không được khách hủy tự động.

Backend kiểm tra thông tin tra cứu, điều kiện hủy, hạn 5 phút, tối đa 5 lần thử và giới hạn gửi lại sau 60 giây. Lưu HMAC của mã, không lưu mã thô. Tiêu thụ OTP và hủy/hoàn kho trong cùng transaction; không dùng lại được. OTP thật không xuất hiện trong JSON phản hồi hoặc log.

## OTP demo trên local

Đặt `CANCEL_OTP_DEMO=true` trong `backend/.env`, khởi động lại backend và dùng `http://localhost:4200` kết nối `http://localhost:3000`.
Backend chỉ cho chế độ này khi `NODE_ENV` khác `production`, socket kết nối trực tiếp qua loopback, hostname/Origin là localhost hoặc loopback và không có header proxy chuyển tiếp. Mặc định cấu hình mẫu là `false`.

Ở chế độ demo, không gọi dịch vụ SMS; tạo mã ngẫu nhiên 4 chữ số và trả `demoCode` để popup hiển thị rõ “OTP demo trên local — không gửi SMS”. Mã vẫn có hạn 5 phút, tối đa 5 lần thử, cooldown 60 giây. Không tự điền mã, không dùng mã cố định. DB lưu HMAC và `isDemo: true`, không lưu mã thô.

Nhập đúng mã và xác nhận vẫn thực hiện hủy đơn, hoàn trả trong database đang kết nối; đây chỉ là mô phỏng kênh gửi OTP, không phải mô phỏng toàn bộ thao tác database. Bên ngoài local/ở production không được phát mã demo; xác thực ở chế độ thật cũng loại trừ các challenge demo cũ.

## Kết nối SMS thật

```env
SMS_OTP_URL=https://your-sms-gateway.example/send
SMS_OTP_TOKEN=your-private-token
```

Đây là hợp đồng gateway của ứng dụng, không phải URL API dùng chung cho mọi nhà cung cấp. Gateway nhận POST JSON `{ to, code, purpose: "order-cancellation", expiresInSeconds: 300 }`, xác thực Bearer token, trả HTTP 2xx khi đã chấp nhận gửi SMS. Gateway cần chuẩn hóa số điện thoại Việt Nam theo nhà cung cấp. Khi biết nhà cung cấp có thể thay adapter `sendCancelSms` bằng API cụ thể.

Khi không bật demo: thiếu cấu hình SMS thì trả 503 và không hủy đơn. Không có mã mặc định. Không công khai OTP để thử trên production. Cần khởi động lại backend khi cập nhật cấu hình.

Endpoint `PATCH /api/orders/:id/cancel` không còn cho khách ẩn danh hủy khi thiếu OTP. Chủ tài khoản đăng nhập hợp lệ vẫn có thể hủy đơn của chính mình qua trang đơn hàng; hủy qua trang tra cứu luôn gửi OTP. Quy tắc thời hạn/trạng thái hủy vẫn được giữ nguyên.

Kiểm thử gateway và OTP dùng mock, không gửi SMS và không hủy đơn thật trên Atlas.
# Lý do hủy và hoàn trả

Khách chọn một trong sáu lý do trước khi yêu cầu OTP. `PATCH /api/orders/:id/cancel`
nhận thêm `reason` và `note` (tối đa 1000 ký tự, bắt buộc với “Lý do khác”).
Chỉ đơn Đã đặt/Đang xử lý được khách hủy; xác thực OTP vẫn bắt buộc cho khách vãng lai.

Trong cùng MongoDB transaction: tiêu thụ OTP, đối chiếu trạng thái cũ, ghi
`cancellation` và `statusHistory`, hoàn kho chưa chuẩn bị về đúng chi nhánh,
trả một lượt voucher đã sử dụng và hoàn số Stars thực tế đã trừ cho tài khoản.
`starsUsed` được lưu cho đơn mới; đơn cũ đối chiếu lịch sử trừ Stars theo mã đơn.
Không tự hoàn kho đã chuẩn bị. Request trùng hoặc xung đột trạng thái không hoàn trả lần nữa.

Tiền cọc đã trả không tự hoàn theo chính sách hiện tại. Ghi nhận `depositForfeited`;
đơn đánh dấu đã thanh toán được gắn `paymentReviewRequired` khi cần cửa hàng đối soát.
Đây không phải tích hợp hoàn tiền qua ngân hàng/cổng thanh toán, và không đánh dấu
khoản tiền là “đã hoàn”. Không chạy điều chỉnh hồi tố các đơn cũ đã hủy.

