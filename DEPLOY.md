# Hướng dẫn deploy LỊM DONUT (GitHub + Vercel + Render + MongoDB Atlas)

## 0. Chuẩn bị đã xong sẵn trong code
-  URL API tập trung ở `my-app/src/environments/` và `my-app-admin/src/environments/`
  (dev tự dùng `localhost:3000`, build production dùng URL trong `environment.ts`)
-  `vercel.json` cho cả 2 app (SPA rewrite — F5 không bị 404)
-  `trust proxy` cho rate-limiter chạy sau proxy Render
-  `.gitignore` đã chặn `backend/.env`, `node_modules/`, `backend/uploads/`

## 1. Push lên GitHub
```bash
git add -A
git commit -m "Chuan bi deploy"
# tạo repo trên github.com rồi:
git remote add origin https://github.com/<username>/LIMDonut.git
git push -u origin main
```

## 2. MongoDB Atlas (DB trên mây, free)
1. Đăng ký https://www.mongodb.com/cloud/atlas → Create **M0 Free** cluster.
2. Database Access → tạo user + password.
3. Network Access → Add IP → **0.0.0.0/0** (cho Render kết nối được).
4. Connect → Drivers → copy connection string, thêm tên DB `limdonut`:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/limdonut`
5. Seed dữ liệu từ máy bạn (sửa tạm `MONGODB_URI` trong `backend/.env` thành chuỗi Atlas rồi chạy):
   ```bash
   cd backend
   node scripts/seedAdmin.js
   node scripts/seedProducts.js
   node scripts/seedVouchers.js
   ```
   (xong có thể đổi `.env` về lại local nếu muốn dev tiếp với DB local)

## 3. Backend lên Render (free)
1. https://render.com → New → **Web Service** → connect repo GitHub.
2. Cấu hình:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - Instance type: Free
3. Environment Variables:
   | Key | Value |
   |---|---|
   | `MONGODB_URI` | chuỗi Atlas ở bước 2 |
   | `JWT_SECRET` | chuỗi ngẫu nhiên dài, bí mật |
   | `ADMIN_PASSWORD` | mật khẩu admin mạnh |
   | `CORS_ORIGINS` | *(điền sau bước 4, tạm để trống hoặc localhost)* |
4. Deploy → nhận domain dạng `https://limdonut-backend.onrender.com`.
   Test nhanh: mở `https://<domain>/api/products` phải thấy JSON 40 món.

## 4. Sửa URL backend trong code rồi push lại
Mở 2 file và thay URL bằng domain Render thật của bạn:
- `my-app/src/environments/environment.ts`
- `my-app-admin/src/environments/environment.ts`
```ts
apiBase: 'https://<domain-render-cua-ban>.onrender.com'
```
```bash
git add -A && git commit -m "Cap nhat API URL production" && git push
```

## 5. Frontend lên Vercel (2 project, cùng 1 repo)
**Project 1 — web khách:**
1. https://vercel.com → Add New → Project → import repo LIMDonut.
2. **Root Directory**: `my-app` (Framework: Angular — tự nhận).
3. Deploy → nhận domain `https://<ten>.vercel.app`.

**Project 2 — admin:** làm y hệt nhưng Root Directory: `my-app-admin`.

## 6. Mở CORS
Quay lại Render → Environment → sửa `CORS_ORIGINS` thành 2 domain Vercel, phân cách bằng dấu phẩy, KHÔNG có dấu `/` cuối:
```
https://<ten-app>.vercel.app,https://<ten-admin>.vercel.app
```
Save → Render tự redeploy. Xong!

## Note:
- **Ảnh upload (bằng chứng đóng gói / khiếu nại) sẽ MẤT mỗi khi Render restart** (disk ephemeral). Demo thì ổn; muốn bền cần chuyển sang Cloudinary.
- OTP quên mật khẩu: xem trong **Logs** của service Render (dòng `[OTP] ...`).
- Ảnh sản phẩm nằm trong `my-app/public/` được deploy cùng frontend nên không bị ảnh hưởng.
