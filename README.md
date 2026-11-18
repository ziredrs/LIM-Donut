# LIM DONUT

Website thuong mai dien tu ban banh donut thu cong, ho tro dat hang truc tuyen, thanh toan, quan ly don hang va he thong quan tri.

## Demo

- **Website khach hang:** https://limdonut.vercel.app
- **API Backend:** https://limdonutadmin.vercel.app/

## Cong nghe su dung

### Frontend
- Angular 21 (standalone components, signals, zoneless)
- TypeScript 5.9
- Bootstrap 5 + Bootstrap Icons
- Three.js (3D preview Custom Party)
- RxJS

### Backend
- Node.js + Express 5
- Mongoose (MongoDB ODM)
- JWT (xac thuc)
- bcryptjs (ma hoa mat khau)
- Multer (upload file)
- Helmet, Morgan, CORS, express-rate-limit, express-mongo-sanitize

### Co so du lieu
- MongoDB Atlas

### Trien khai
- Vercel (frontend)
- Render (backend)

### API ban do
- OpenStreetMap Nominatim API (geocoding dia chi)
- HTML5 Geolocation API (dinh vi trinh duyet)
- Google Maps Embed + Redirect Link

### Kiem thu
- Vitest + jsdom (frontend)
- Jest + Supertest (backend)

## Tinh nang chinh

### Khach hang
- Xem menu san pham voi bo loc (nhu cau an uong, gia, calo, danh muc)
- Chi tiet san pham voi thong tin dinh duong, danh gia, topping
- Gio hang va thanh toan (tien mat, MoMo, ZaloPay, VNPAY)
- Dat hang giao hoac tu den lay
- Custom Party: tu chon set banh donut voi xem truoc 3D
- Flash Sale / Gio vang: giam gia theo khung gio
- Che do qua tang (gift mode)
- Tra cuu don hang (khach vang lai)
- Lich su don hang (tai khoan dang nhap)
- Khieu nai don hang trong 2 gio
- Dien dan / blog
- Lien he va FAQ
- Chi nhanh gan nhat voi ban do
- Quen mat khau (OTP)
- Voucher giam gia

### Quan tri vien (Admin)
- Dashboard thong ke (doanh thu, don hang, san pham ban chay)
- Quan ly don hang (Kanban board, chuyen trang thai)
- Quan ly san pham (CRUD, ton kho, Flash Sale)
- Quan ly voucher
- Quan ly khach hang
- Quan ly chi nhanh
- Quan ly blog
- Xu ly khieu nai va tin nhan lien he
- Xuat CSV don hang

## Cau truc thu muc

```
LIMDonut/
  my-app/              # Frontend Angular
    src/
      app/
        menu/           # Trang menu san pham
        checkout/       # Thanh toan
        custom-party/   # Dat set banh 3D
        orders/         # Lich su don hang
        branches/       # Chi nhanh
        forum/          # Dien dan
        contact/        # Lien he
        ...
      environments/     # Cau hinh moi truong
    public/             # Anh tinh (san pham, blog)
  my-admin/             # Frontend Admin Angular
  backend/
    models/             # Mongoose schemas
    routes/             # API endpoints
    middleware/         # Auth, rate limit
    utils/             # Tinh gia, phan loai don
    server.js          # Entry point
```

## Cai dat va chay

### Yeu cau
- Node.js >= 18
- MongoDB (local hoac Atlas)
- npm

### Backend

```bash
cd backend
npm install
```

Tao file `.env`:

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_secret
PORT=3000
CORS_ORIGINS=http://localhost:4200,http://localhost:4201
```

```bash
npm run dev
```

Backend chay tai http://localhost:3000

### Frontend (khach hang)

```bash
cd my-app
npm install
npm start
```

Chay tai http://localhost:4200

### Frontend (admin)

```bash
cd my-admin
npm install
npm start -- --port 4201
```

Chay tai http://localhost:4201

## Tai khoan demo

| Vai tro | Username | Mat khau |
|---------|----------|----------|
| Admin   | admin    | admin123 |

## API Endpoints chinh

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| GET | /api/products | Danh sach san pham |
| GET | /api/orders/lookup | Tra cuu don hang (phone + name) |
| POST | /api/orders | Tao don hang moi |
| POST | /api/auth/login | Dang nhap |
| POST | /api/auth/register | Dang ky |
| POST | /api/auth/request-reset | Gui OTP quen mat khau |
| POST | /api/auth/reset-password | Dat lai mat khau |
| GET | /api/branches | Danh sach chi nhanh |
| GET | /api/blog | Danh sach bai viet |
| POST | /api/contact | Gui tin nhan lien he |
| POST | /api/complaints | Gui khieu nai |
| GET | /api/vouchers/validate | Kiem tra voucher |
| GET | /api/orders/stats | Thong ke dashboard (admin) |
