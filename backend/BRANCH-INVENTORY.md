# Tồn kho theo chi nhánh

## Dữ liệu

- `branchinventories`: `branchId` tham chiếu Branch, `productId` là ID số hiện có, `stock` nguyên không âm. Cặp branchId/productId duy nhất.
- `Product.stock` giữ lại dữ liệu cũ để đối chiếu, không còn là nguồn tồn kho bán hàng. API sản phẩm tính tổng kho của các chi nhánh đang hoạt động.
- Đơn mới lưu `branchId`, `branchName` và cờ `inventoryDeducted`. Đơn cũ giữ nguyên, không tự suy diễn chi nhánh từ địa chỉ.

## Áp dụng

1. Triển khai backend và hai frontend cùng phiên bản; backend phải dùng MongoDB Atlas/replica set vì tạo đơn sử dụng transaction.
2. Vào admin → Sản phẩm → chọn chi nhánh → mở sản phẩm → nhập kho thực tế → Lưu tồn kho chi nhánh. Lặp lại cho từng chi nhánh.
3. Kho chưa được nhập bằng 0. Chưa nhập kho thì sản phẩm sẽ báo hết hàng; không có fallback sang Product.stock.
4. Không cộng hoặc sao chép toàn bộ tồn kho cũ vào cả hai chi nhánh. Nếu phân bổ từ số cũ, tổng phân bổ cần đối chiếu thực tế trước khi lưu.

Đã chạy phân bổ theo yêu cầu: 38 sản phẩm thường, tổng 1.234 đơn vị; Cầu Giấy 625, Hoàn Kiếm 609. Mỗi sản phẩm chia đôi, số lẻ dư vào Cầu Giấy. Không sửa Product.stock cũ. Snapshot trước phân bổ nằm trong `backend/backups/` (không đưa lên Git). Script `scripts/applyStockSplit.js` từ chối chạy lại khi đã có kho riêng.

## API

- GET `/api/inventory/:branchId`: kho của chi nhánh hoạt động (public).
- PUT `/api/inventory/:branchId/:productId` với `{ "stock": 12 }`: đặt số tồn hiện tại, cần quyền admin.
- POST `/api/orders`: bắt buộc `branchId`. Đơn thường trừ kho, cộng sold, dùng Star/voucher và lưu đơn trong một transaction. Thiếu kho trả 409, không chặn lỗi bằng cách ép số tồn về 0.
- Combo 99/100: gửi đủ `items[].options.boxDonuts`; trừ từng productId thành phần, gộp cả các dòng cùng sản phẩm.
- Custom Party: lưu chi nhánh nhận bánh nhưng không trừ kho bánh làm sẵn; đây là đơn sản xuất theo yêu cầu.
- Hủy đơn chưa chuẩn bị (Đã đặt/Đã xác nhận): hoàn kho đúng chi nhánh trong transaction, một lần. Đơn đã chuẩn bị/giao thất bại không tự hoàn kho thực phẩm.

Kiểm thử chạy bằng Jest, không dùng kết nối hay dữ liệu Atlas thật. Chưa kiểm tra đặt đơn ghi dữ liệu thực tế trên Atlas.
