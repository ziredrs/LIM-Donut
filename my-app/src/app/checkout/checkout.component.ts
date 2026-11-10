import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CartService } from '../cart.service';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrderService, Order } from '../order.service';
import { Router } from '@angular/router';
import { classifyOrder, calculateShipping, applyDiscountCap, haversineDistanceKm } from '../pricing.util';
import { BRANCHES_DATA } from '../branches.data';
import { AuthService } from '../auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ImgUrlPipe } from '../img-url.pipe';
import { PICKUP_HOURS, PICKUP_MINUTES, localDateValue, validPickupTime, displayPickupDate, parsePickupDate } from '../pickup-time.util';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ImgUrlPipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit {
  cartService = inject(CartService);
  orderService = inject(OrderService);
  authService = inject(AuthService);
  router = inject(Router);

  // Giảm 15% đơn đầu cho tài khoản đăng ký bằng mã giới thiệu
  referralActive = signal(localStorage.getItem('pendingReferralDiscount') === 'true');
  get discount(): number {
    return this.referralActive() ? Math.floor(this.subtotal * 0.15) : 0;
  }
  starsInput = signal(0);
  starWarning = signal('');

  // Chế độ quà tặng
  isGift = signal(false);
  giftMessage = signal('');
  hideGiftPrice = signal(false);

  // Mã giảm giá (voucher)
  private http = inject(HttpClient);
  voucherInput = signal('');
  appliedVoucherCode = signal('');
  voucherDiscount = signal(0);
  voucherMsg = signal('');
  voucherChecking = signal(false);
  private voucherRequest = 0;

  get selectedItemCount() {
    return this.cartService.selectedItems().reduce((sum, item) => sum + item.quantity, 0);
  }

  applyVoucher() {
    const code = this.voucherInput().trim().toUpperCase();
    if (!code || this.voucherChecking()) return;
    const request = ++this.voucherRequest;
    const subtotal = this.subtotal;
    this.voucherChecking.set(true);
    this.voucherMsg.set('');
    this.http.post<{ code: string; discount: number }>(`${environment.apiBase}/api/vouchers/validate`, {
      code, orderTotal: this.subtotal
    }).subscribe({
      next: res => {
        if (request !== this.voucherRequest) return;
        if (subtotal !== this.subtotal) { this.removeVoucher(); return; }
        this.appliedVoucherCode.set(res.code);
        this.voucherDiscount.set(res.discount);
        this.voucherMsg.set(`Áp dụng mã ${res.code} thành công!`);
        this.voucherChecking.set(false);
      },
      error: err => {
        if (request !== this.voucherRequest) return;
        this.appliedVoucherCode.set('');
        this.voucherDiscount.set(0);
        this.voucherMsg.set(err.status === 0
          ? 'Không thể kết nối máy chủ để kiểm tra mã. Vui lòng thử lại.'
          : err.status >= 500
            ? 'Máy chủ đang gặp lỗi khi kiểm tra mã. Vui lòng thử lại sau.'
            : err.error?.message || 'Không thể áp dụng mã giảm giá. Vui lòng kiểm tra lại.');
        this.voucherChecking.set(false);
      }
    });
  }

  removeVoucher() {
    this.voucherRequest++;
    this.voucherChecking.set(false);
    this.appliedVoucherCode.set('');
    this.voucherDiscount.set(0);
    this.voucherInput.set('');
    this.voucherMsg.set('');
  }

  deliveryMethod = signal<'delivery' | 'pickup'>('delivery');
  distanceKm = signal(3);
  
  // Geocoding & suggestions state
  geocodingActive = signal(false);
  geocodingError = signal(false);
  addressLocationApproximate = signal(false);
  nearestBranchSuggestion = signal<string>('');
  geocodedDistance = signal<number | null>(null);
  private geocodeTimeout: any = null;

  // Form data
  address = signal('');
  recipient = signal('');
  phoneNumber = signal('');
  deliveryTime = signal('');
  notes = signal('');
  branch = signal('');
  branches = signal<{ _id: string; name: string; address: string; active: boolean }[]>([]);
  branchStock = signal<Record<number, number>>({});
  stockReady = signal(false);
  stockMessage = signal('');
  private lastDeliveryCoordinates?: { lat: number; lng: number };
  private branchChosenManually = false;
  private addressRequestVersion = 0;

  selectBranch(id: string, manual = true) {
    if (manual) this.branchChosenManually = true;
    this.branch.set(id);
    this.stockReady.set(false);
    this.branchStock.set({});
    this.stockMessage.set('');
    if (!id) return;
    this.http.get<{ productId: number; stock: number }[]>(`${environment.apiBase}/api/inventory/${id}`).subscribe({
      next: rows => { if (this.branch() === id) { this.branchStock.set(Object.fromEntries(rows.map(row => [row.productId, row.stock]))); this.stockReady.set(true); } },
      error: () => { if (this.branch() === id) this.stockMessage.set('Không tải được tồn kho. Vui lòng chọn lại chi nhánh.'); }
    });
  }
  get branchHasStock(): boolean {
    if (!this.stockReady()) return false;
    const required = new Map<number, number>();
    for (const item of this.cartService.selectedItems()) {
      const ids = item.productId === 99 || item.productId === 100
        ? (item.options.boxDonuts || []).map(d => d.productId) : [item.productId];
      if (!ids.length) return false;
      for (const id of ids) required.set(id, (required.get(id) || 0) + item.quantity);
    }
    return [...required].every(([id, qty]) => (this.branchStock()[id] || 0) >= qty);
  }
  
  // Validation messages
  phoneError = signal('');
  timeError = signal('');
  
  // Modal state
  showTimeModal = signal(false);
  selectedDate = signal(localDateValue());
  selectedDateText = signal(displayPickupDate(localDateValue()));
  changeSelectedDateFromCalendar(value: string) { this.changeSelectedDate(displayPickupDate(value)); }
  changeSelectedDate(value: string) {
    this.selectedDateText.set(value);
    this.selectedDate.set(parsePickupDate(value));
  }
  selectedHour = signal('07');
  selectedMinute = signal('00');
  
  minDate = localDateValue();
  
  hours = PICKUP_HOURS;
  get minutes() { return this.selectedHour() === '21' ? ['00'] : PICKUP_MINUTES; }
  onHourChange(hour: string) {
    this.selectedHour.set(hour);
    if (hour === '21') this.selectedMinute.set('00');
  }
  
  paymentMethod = signal('cash');
  agreedToTerms = signal(false);
  paymentSplit = signal<'deposit' | 'full'>('deposit');

  ngOnInit() {
    this.http.get<{ _id: string; name: string; address: string; active: boolean }[]>(`${environment.apiBase}/api/branches`).subscribe({
      next: rows => {
        this.branches.set(rows.filter(b => b.active));
        const coords = this.lastDeliveryCoordinates;
        if (coords) this.calculateNearestBranch(coords.lat, coords.lng);
      },
      error: () => this.branch.set('')
    });
    if (this.authService.isLoggedIn()) {
      const u = this.authService.user();
      if (u) {
        this.recipient.set(u.username || '');
        this.phoneNumber.set(u.phone || '');
        this.address.set(u.address || '');
        if (u.address) {
          this.geocodeAddress(u.address);
        }
      }
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem('guestCheckoutInfo') || '{}');
        if (saved.name) this.recipient.set(saved.name);
        if (saved.phone) this.phoneNumber.set(saved.phone);
        if (saved.address) {
          this.address.set(saved.address);
          this.geocodeAddress(saved.address);
        }
      } catch (_) {}
    }

    // Check if geolocation was stored in sessionStorage from branches page
    try {
      const stored = sessionStorage.getItem('userGeoLocation');
      if (stored) {
        const coords = JSON.parse(stored);
        this.calculateNearestBranch(coords.lat, coords.lng);
      }
    } catch (_) {}
  }

  onAddressChange(addr: string) {
    this.address.set(addr);
    this.addressRequestVersion++;
    this.branchChosenManually = false;
    this.lastDeliveryCoordinates = undefined;

    if (this.geocodeTimeout) {
      clearTimeout(this.geocodeTimeout);
    }

    if (!addr.trim() || this.deliveryMethod() === 'pickup') {
      this.geocodingActive.set(false);
      this.geocodingError.set(false);
      this.nearestBranchSuggestion.set('');
      this.geocodedDistance.set(null);
      return;
    }

    this.geocodeTimeout = setTimeout(() => {
      this.geocodeAddress(addr);
    }, 800);
  }

  geocodeAddress(addr: string) {
    const requestVersion = ++this.addressRequestVersion;
    this.geocodingActive.set(true);
    this.geocodingError.set(false);

    this.http.post<{ lat: number; lng: number; precision: string }>(`${environment.apiBase}/api/delivery-location`, { address: addr }).subscribe({
      next: (res) => {
        if (requestVersion !== this.addressRequestVersion) return;
        this.geocodingActive.set(false);
        if (res && Number.isFinite(res.lat) && Number.isFinite(res.lng)) {
          const lat = res.lat;
          const lng = res.lng;
          this.addressLocationApproximate.set(res.precision === 'street');
          this.calculateNearestBranch(lat, lng);
        } else {
          this.geocodingError.set(true);
          this.nearestBranchSuggestion.set('');
          this.geocodedDistance.set(null);
        }
      },
      error: (err) => {
        if (requestVersion !== this.addressRequestVersion) return;
        console.error('Geocoding error:', err);
        this.geocodingActive.set(false);
        this.geocodingError.set(true);
        this.nearestBranchSuggestion.set('');
        this.geocodedDistance.set(null);
      }
    });
  }

  private calculateNearestBranch(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.lastDeliveryCoordinates = { lat, lng };
    let closestBranch: any = null;
    let minDistance = Infinity;

    BRANCHES_DATA.forEach(b => {
      const dist = haversineDistanceKm(lat, lng, b.lat, b.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestBranch = b;
      }
    });

    if (closestBranch) {
      const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const street = closestBranch.id === 1 ? 'to hieu' : 'tho nhuom';
      const matched = this.branches().find(b => normalize(`${b.name} ${b.address}`).includes(street));
      if (matched && !this.branchChosenManually && this.branch() !== matched._id) this.selectBranch(matched._id, false);
      this.distanceKm.set(minDistance);
      this.nearestBranchSuggestion.set(closestBranch.name);
      this.geocodedDistance.set(minDistance);
    }
  }

  // QR modal state
  showQrModal = signal(false);
  qrCountdown = signal(900); // 15 minutes in seconds
  qrExpired = signal(false);
  pendingOrder: any = null;
  private countdownInterval: any = null;

  get subtotal() {
    return this.cartService.selectedItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  readonly shippingResult = computed(() => {
    if (!this.cartService.selectedItems().length) return { fee: 0, estimatedTime: '' };
    if (this.deliveryMethod() === 'pickup') return { fee: 0, estimatedTime: '' };
    return calculateShipping(this.distanceKm(), this.subtotal);
  });

  get shippingFee(): number {
    return this.shippingResult().fee ?? 0;
  }

  get shippingOutOfRange(): boolean {
    return this.deliveryMethod() === 'delivery' && this.shippingResult().fee === null;
  }

  readonly starsDiscount = computed(() => {
    const cap = applyDiscountCap(this.subtotal, this.starsInput(), 0);
    return cap.stars;
  });

  get total() {
    return Math.max(0, this.subtotal + this.shippingFee - this.discount - this.starsDiscount() - this.voucherDiscount());
  }

  onStarsInputChange(val: number) {
    const userStars = this.authService.user()?.stars || 0;
    if (val > userStars) {
      val = userStars;
      this.starWarning.set(`Bạn chỉ có ${userStars.toLocaleString()} Star.`);
    } else {
      this.starWarning.set('');
    }
    this.starsInput.set(val);
    const capped = applyDiscountCap(this.subtotal, val, 0);
    if (capped.stars < val) {
      this.starWarning.set(`Tối đa 30% tạm tính = ${capped.stars.toLocaleString()}đ. Đã tự điều chỉnh.`);
    }
  }

  readonly orderClassification = computed(() => classifyOrder(this.total));

  get isFormValid(): boolean {
    const phoneValid = /^\d{10}$/.test(this.phoneNumber());
    const recipientValid = this.recipient().length > 0;
    const branchValid = this.branch().length > 0;
    const timeValid = this.deliveryTime().length > 0 && this.timeError() === '';
    const addressValid = this.deliveryMethod() === 'pickup' || this.address().length > 0;

    return phoneValid && addressValid && recipientValid && branchValid && timeValid
      && this.cartService.selectedItems().length > 0 && this.branchHasStock && !this.shippingOutOfRange && this.agreedToTerms();
  }

  validatePhone() {
    if (this.phoneNumber() && !/^\d{10}$/.test(this.phoneNumber())) {
      this.phoneError.set('Số điện thoại phải bao gồm đúng 10 chữ số');
    } else {
      this.phoneError.set('');
    }
  }

  formatPrice(price: number): string {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + 'đ';
  }

  increaseQty(id: string, currentQty: number) {
    this.cartService.updateQuantity(id, currentQty + 1);
  }

  decreaseQty(id: string, currentQty: number) {
    if (currentQty <= 1) {
      this.cartService.removeFromCart(id);
    } else {
      this.cartService.updateQuantity(id, currentQty - 1);
    }
  }

  removeItem(id: string) {
    this.cartService.removeFromCart(id);
  }

  removeOption(itemId: string, type: 'heating' | 'topping', name?: string) {
    this.cartService.removeOption(itemId, type, name);
  }

  openTimeModal() {
    this.minDate = localDateValue();
    if (!this.deliveryTime()) {
      const now = new Date();
      if (now.getHours() >= 21) now.setDate(now.getDate() + 1);
      this.selectedDate.set(localDateValue(now));
      this.selectedHour.set(now.getHours() >= 7 && now.getHours() < 21 ? String(now.getHours()).padStart(2, '0') : '07');
      this.selectedMinute.set(now.getHours() >= 7 && now.getHours() < 21 ? String(now.getMinutes()).padStart(2, '0') : '00');
    }
    this.selectedDateText.set(displayPickupDate(this.selectedDate()));
    this.showTimeModal.set(true);
  }

  closeTimeModal() {
    this.showTimeModal.set(false);
  }

  confirmTime() {
    if (!this.selectedDate() || !validPickupTime(`${this.selectedHour()}:${this.selectedMinute()}`)) {
      this.timeError.set('Vui lòng chọn ngày hợp lệ và giờ nhận từ 07:00 đến 21:00.');
      return;
    }
    const now = new Date();
    const selDate = new Date(this.selectedDate() + 'T00:00:00');
    const pickup = new Date(`${this.selectedDate()}T${this.selectedHour()}:${this.selectedMinute()}:59`);
    if (!Number.isFinite(pickup.getTime()) || pickup < now) {
      this.timeError.set('Vui lòng chọn thời gian nhận không nằm trong quá khứ.');
      return;
    }
    
    // Đơn lớn đặt trước tối thiểu 3 ngày (Party L, bánh tiệc)
    const cls = this.orderClassification();
    const minDays = cls.orderType === 'custom' ? 3 : 0;
    
    const minDate = new Date();
    minDate.setDate(now.getDate() + minDays);
    minDate.setHours(0,0,0,0);
    selDate.setHours(0,0,0,0);

    if (selDate < minDate) {
      const minDateStr = `${minDate.getDate().toString().padStart(2, '0')}/${(minDate.getMonth() + 1).toString().padStart(2, '0')}/${minDate.getFullYear()}`;
      this.timeError.set(`Đơn lớn cần đặt trước tối thiểu ${minDays} ngày. Vui lòng chọn từ ngày ${minDateStr}`);
      return;
    }

    this.timeError.set('');
    const date = new Date(this.selectedDate());
    const formattedDate = `${(date.getDate()).toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    this.deliveryTime.set(`Nhận hàng ngày ${formattedDate} - Vào lúc ${this.selectedHour()}:${this.selectedMinute()}`);
    this.closeTimeModal();
  }

  private buildOrder(): any {
    const cls = this.orderClassification();
    const split = this.paymentSplit();
    const isFull = cls.orderType === 'small' || split === 'full';
    
    const depositPercent = isFull ? 100 : cls.depositPercent;
    const depositAmount = isFull ? this.total : cls.depositAmount;
    const remainingAmount = isFull ? 0 : cls.remainingAmount;

    return {
      orderId: 'DH-' + Math.floor(1000000 + Math.random() * 9000000),
      branchId: this.branch(),
      totalAmount: this.total,
      orderType: cls.orderType,
      depositPercent,
      depositAmount,
      remainingAmount,
      deliveryMethod: this.deliveryMethod(),
      paymentMethod: this.paymentMethod(),
      paymentStatus: this.paymentMethod() === 'cash' ? 'pending' : 'pending',
      status: 'Đã đặt',
      customerInfo: {
        name: this.recipient(),
        phone: this.phoneNumber(),
        address: this.deliveryMethod() === 'pickup' ? `Lấy tại quầy (${this.branches().find(b => b._id === this.branch())?.name || ''})` : this.address(),
        deliveryTime: this.deliveryTime(),
        notes: this.notes(),
        isGift: this.isGift(),
        giftMessage: this.isGift() ? this.giftMessage().trim() : '',
        hideGiftPrice: this.isGift() ? this.hideGiftPrice() : false
      },
      starsToUse: this.starsDiscount(),
      shippingFee: this.shippingFee,
      referralDiscount: this.discount,
      voucherCode: this.appliedVoucherCode() || undefined,
      items: this.cartService.selectedItems().map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        options: {
          heating: item.options.heating,
          boxDonuts: item.options.boxDonuts,
          toppings: item.options.toppings
        }
      }))
    };
  }

  placeOrder() {
    if (!this.isFormValid) return;

    if (this.paymentMethod() !== 'cash') {
      const order = this.buildOrder();
      localStorage.setItem('pendingOrder', JSON.stringify(order));
      if (this.paymentMethod() === 'momo') {
        this.router.navigate(['/payment/momo']);
      } else if (this.paymentMethod() === 'vnpay') {
        this.router.navigate(['/payment/vnpay']);
      }
      return;
    }

    const newOrder = this.buildOrder();
    this.submitOrder(newOrder);
  }

  private submitOrder(order: any) {
    this.orderService.addOrder(order).subscribe({
      next: () => {
        if (this.referralActive()) {
          localStorage.removeItem('pendingReferralDiscount');
          this.referralActive.set(false);
        }
        this.cartService.removePurchasedItems(order.items);
        if (this.authService.isLoggedIn()) {
          this.authService.fetchMe().subscribe({ error: () => {} });
          this.router.navigate(['/orders']);
        } else {
          localStorage.setItem('guestCheckoutInfo', JSON.stringify({ name: this.recipient(), phone: this.phoneNumber(), address: this.address() }));
          this.router.navigate(['/orders'], { queryParams: { phone: this.phoneNumber(), name: this.recipient(), justPlaced: order.orderId } });
        }
      },
      error: (err) => {
        console.error('Order error:', err);
        if (err.status === 409) this.selectBranch(this.branch());
        alert('Lỗi khi đặt hàng: ' + (err.error?.message || err.message || JSON.stringify(err.error)));
      }
    });
  }

  get qrPayAmount(): number {
    if (!this.pendingOrder) return 0;
    const cls = this.orderClassification();
    if (cls.orderType === 'small' || this.paymentSplit() === 'full') {
      return this.total;
    }
    return cls.depositAmount;
  }

  get qrCodeUrl(): string {
    const orderId = this.pendingOrder?.orderId || 'DEMO';
    const amount = this.qrPayAmount;
    const data = encodeURIComponent(`LIMDonut|${orderId}|${amount}VND`);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data}`;
  }

  get qrMinutes(): string {
    return Math.floor(this.qrCountdown() / 60).toString().padStart(2, '0');
  }

  get qrSeconds(): string {
    return (this.qrCountdown() % 60).toString().padStart(2, '0');
  }

  get paymentMethodLabel(): string {
    const map: Record<string, string> = { momo: 'MoMo', vnpay: 'Vn Pay' };
    return map[this.paymentMethod()] || this.paymentMethod();
  }

  openQrModal() {
    this.qrCountdown.set(900);
    this.qrExpired.set(false);
    this.showQrModal.set(true);
    this.startCountdown();
  }

  closeQrModal() {
    this.showQrModal.set(false);
    this.stopCountdown();
    this.pendingOrder = null;
  }

  private startCountdown() {
    this.stopCountdown();
    this.countdownInterval = setInterval(() => {
      const val = this.qrCountdown() - 1;
      if (val <= 0) {
        this.qrCountdown.set(0);
        this.qrExpired.set(true);
        this.stopCountdown();
      } else {
        this.qrCountdown.set(val);
      }
    }, 1000);
  }

  private stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  resetQr() {
    this.qrCountdown.set(900);
    this.qrExpired.set(false);
    this.startCountdown();
  }

  confirmQrPayment() {
    if (!this.pendingOrder) return;
    this.pendingOrder.paymentStatus = 'paid';
    this.stopCountdown();
    this.showQrModal.set(false);
    this.submitOrder(this.pendingOrder);
    this.pendingOrder = null;
  }
}
