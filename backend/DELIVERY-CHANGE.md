# Đổi thông tin nhận hàng khi khách muốn hủy đơn

- Chỉ đơn `Đã đặt`/`Đang xử lý` được đổi tự động. Người có tài khoản phải xác thực quyền sở hữu; khách vãng lai phải cung cấp tên và số điện thoại khớp đơn khách.
- `POST /api/orders/:id/delivery-change/quote`: nhận `deliveryMethod`, `address` (giao hàng) hoặc `branchId` (lấy tại cửa hàng), cùng thông tin tra cứu khách. Không ghi dữ liệu.
- Khi có `GOOGLE_MAPS_API_KEY`, backend dùng Google Geocoding để xác định địa chỉ và Google Routes `computeRoutes` (`DRIVE`) để lấy `distanceMeters`, áp dụng giới hạn 15 km theo quãng đường ô tô. Không tin tọa độ hoặc phí do client gửi. Nếu Google lỗi, không âm thầm chuyển sang cách tính khác.
- Khi chưa có key, checkout và popup dùng chung Nominatim qua backend và khoảng cách Haversine. Ưu tiên kết quả đúng số nhà; cho phép ước tính theo đường/ngõ khớp địa chỉ trong Hà Nội như cách checkout trước đây. Không dùng tâm phường/quận hoặc địa danh cùng tên ở tỉnh khác. Vị trí theo đường/ngõ được ghi rõ là ước tính; giữ nguyên số nhà khách nhập, hiển thị địa danh đã định vị và yêu cầu xác nhận `locationConfirmed: true` khi cập nhật. Nếu vị trí ước tính ngoài 15 km, chỉ yêu cầu xác định rõ hơn, không tự kết luận ngoài vùng.
- Chọn chi nhánh còn hoạt động, đủ hàng và trong phạm vi 15 km. Tọa độ ưu tiên `Branch.lat/lng`; hai địa chỉ Tô Hiệu và Thợ Nhuộm có tọa độ dự phòng từ cấu hình website hiện tại. Chi nhánh chưa có tọa độ vẫn có thể chọn nhận tại cửa hàng.
- Áp dụng Bảng 4 theo giá trị hàng trước chiết khấu: <=5 km: 20k/10k/0; >5–10 km: 30k/30k/10k; >10–15 km: 40k/30k/20k, lần lượt cho <500k, 500k–2 triệu, >2 triệu. Ngoài 15 km trả `pickupOnly: true`.
- Trả thông tin phí cũ/mới, tổng mới, tiền cọc và số còn lại cùng token ký có hiệu lực 10 phút. Khách phải bấm xác nhận.
- `POST /api/orders/:id/delivery-change/confirm`: nhận `token` và thông tin khách. Xác thực lại trạng thái, quyền sở hữu, phiên bản đơn, chi nhánh và tồn kho. Chuyển giữ kho giữa hai chi nhánh và cập nhật địa chỉ/phí/tổng/lịch sử trong cùng transaction; không tăng doanh số bán, không tạo đơn mới, không hoàn voucher/Stars.
- `deliveryRevision` và snapshot chống dùng lại token hoặc xác nhận sau khi đơn đã thay đổi. Lỗi giữa chừng không cập nhật một phần.
- Đơn đã thanh toán có chênh lệch tổng cần liên hệ đối soát, không tự thu hoặc hoàn tiền. Đơn cũ thiếu dữ liệu phí chỉ tự khôi phục khi suy ra được một mức phí hợp lệ; nếu không, giải thích và giữ lựa chọn tiếp tục hủy theo chính sách.
- Mọi thay đổi thành công được lưu trong `deliveryChangeHistory`. Không tự sửa các đơn cũ hoặc địa chỉ trong hồ sơ khách hàng.

## Kích hoạt Google Maps

1. Trong Google Cloud Console, chọn dự án và liên kết Billing.
2. Enable **Geocoding API** và **Routes API**.
3. Tạo API key cho backend, giới hạn API sử dụng cho hai API trên; giới hạn IP máy chủ nếu có IP cố định. Đặt quota phù hợp với website demo.
4. Điền `GOOGLE_MAPS_API_KEY=...` trong `backend/.env` khi chạy local, hoặc biến môi trường backend trên Render. Không đưa key này vào Angular, Git hoặc ảnh chụp.
5. Khởi động lại backend. Phần xem trước ghi “Quãng đường ô tô (Google Maps)” và có liên kết xem tuyến. Trước khi điền key, giao diện vẫn ghi rõ khoảng cách ước tính theo tọa độ.

Địa chỉ nhập cần đúng khu vực: ví dụ địa chỉ khu Nghĩa Tân không nên kèm quận Hoàn Kiếm/Cửa Nam nếu thực tế ở khu Nghĩa Đô/Cầu Giấy. Kết quả Google `partial_match` hoặc `APPROXIMATE` không được dùng để kết luận phạm vi dịch vụ.

`POST /api/delivery-location` nhận `{ address }` cho checkout, trả cùng tọa độ và mức chính xác mà popup sử dụng. Endpoint này chỉ định vị, không ghi đơn hàng và không nhận khoảng cách/phí do client quyết định.

## Chỉnh sửa trực tiếp từ popup lý do hủy

- Popup rộng tối đa 900px, vẫn vừa màn hình nhỏ. Lý do phí giao hàng cao dùng ngay luồng xem trước/chuyển nhận tại cửa hàng phía trên, không chuyển sang trang liên hệ.
- `POST /api/orders/:id/edit/quote` nhận `kind: time`, `date: dd/mm/yyyy`, `time: HH:mm`; kiểm tra giờ 07:00–21:00, ngày tương lai theo múi giờ Việt Nam, chi nhánh hoạt động và thời gian đặt trước Custom Party.
- `kind: items` nhận các dòng `{sourceIndex, productId, quantity}`. `sourceIndex` là dòng gốc để giữ giá/topping đã đặt khi chỉ đổi số lượng; `null` là thêm bánh mới. Đổi sang bánh khác lấy giá menu từ DB và bỏ tùy chọn cũ. Combo có sẵn chỉ đổi số lượng hoặc bỏ; cấu hình Custom Party dùng luồng hỗ trợ riêng.
- Xem trước kiểm tra tồn kho tăng thêm, giá, điều kiện voucher, giới hạn Stars và phí giao hàng Bảng 4. Nếu giảm đơn làm dư Stars đã dùng, phần dư được hiển thị trước và hoàn vào tài khoản trong transaction khi xác nhận; không trừ thêm Stars. Giữ lượt voucher đã dùng, không tăng lượt dùng khi sửa đơn.
- `POST /api/orders/:id/edit/confirm` nhận token xem trước và thông tin xác thực khách hàng. Tính lại trong transaction, đối chiếu bản xem trước, chuyển tồn kho theo chênh lệch từng sản phẩm, cập nhật tổng/giờ/Stars và `orderEditHistory`. Không đổi trạng thái đơn và không tạo đơn mới. Chỉ đơn Đã đặt/Đang xử lý được sửa tự động.
- Cả chỉnh sửa địa chỉ, giờ và sản phẩm dùng chung `deliveryRevision`/snapshot để tránh ghi đè hoặc áp dụng lại request. Không ghi dữ liệu ở bước xem trước. Đơn đã thanh toán có chênh lệch cần đối soát, không tự thu/hoàn tiền qua cổng thanh toán.

Tài liệu: https://developers.google.com/maps/documentation/routes/compute_route_directions
và https://developers.google.com/maps/documentation/geocoding/usage-and-billing
