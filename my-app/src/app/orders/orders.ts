import { CancelReasonDialogComponent } from '../cancel-reason-dialog.component';
import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, interval, catchError, switchMap, tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OrderService, Order } from '../order.service';
import { AuthService } from '../auth.service';
import { CartService } from '../cart.service';
import { ComplaintService } from '../complaint.service';
import { environment } from '../../environments/environment';
import { ImgUrlPipe } from '../img-url.pipe';
import { ReviewService } from '../review.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CancelReasonDialogComponent, CommonModule, RouterModule, FormsModule, ImgUrlPipe],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders implements OnInit, OnDestroy {
  orderService = inject(OrderService);
  authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cartService = inject(CartService);
  private complaintService = inject(ComplaintService);
  private reviewService = inject(ReviewService);
  reviewOrder = signal<Order | null>(null);
  reviewDrafts = signal<{ productId: number; name: string; rating: number; title: string; comment: string; busy: boolean; sent: boolean; error: string }[]>([]);
  readonly reviewSuggestions = ['Donut rất ngon', 'Trang trí đẹp mắt', 'Giao hàng nhanh', 'Đóng gói cẩn thận', 'Sẽ ủng hộ tiếp'];

  openReview(order: Order) {
    if (order.status !== 'Hoàn thành' || this.isOrderReviewed(order) || this.reviewSubmitting()) return;
    this.reviewError.set('');
    if (this.reviewOrder()?._id === order._id) { this.reviewOrder.set(null); return; }
    this.reviewOrder.set(order);
    const seen = new Set<number>();
    this.reviewDrafts.set(order.items.flatMap(item => {
      const productId = Number(item.productId || String(item.id).split('_')[0]);
      if (!Number.isInteger(productId) || productId <= 0 || seen.has(productId)) return [];
      seen.add(productId);
      return [{ productId, name: item.name, rating: 5, title: '', comment: '', busy: false, sent: false, error: '' }];
    }));
  }

  updateReview(index: number, patch: Partial<ReturnType<typeof this.reviewDrafts>[number]>) {
    this.reviewDrafts.update(drafts => drafts.map((draft, i) => i === index ? { ...draft, ...patch } : draft));
  }

  addReviewSuggestion(index: number, suggestion: string) {
    const draft = this.reviewDrafts()[index];
    this.updateReview(index, { comment: draft.comment ? `${draft.comment}, ${suggestion}` : suggestion });
  }

  reviewSubmitting = signal(false);
  reviewError = signal('');
  private reviewedOrders = signal(new Set<string>());

  isOrderReviewed(order: Order): boolean {
    return !!order.hasReviewed || this.reviewedOrders().has(order._id || '');
  }

  canSubmitOrderReview(): boolean {
    return !this.reviewSubmitting() && this.reviewDrafts().length > 0 && this.reviewDrafts().every(draft => !!draft.comment.trim());
  }

  submitOrderReview() {
    const order = this.reviewOrder();
    if (!order?._id || this.isOrderReviewed(order) || !this.canSubmitOrderReview()) return;
    this.reviewSubmitting.set(true);
    this.reviewError.set('');
    this.reviewDrafts.update(drafts => drafts.map(draft => ({ ...draft, busy: true })));
    this.reviewService.addOrderReviews({
      orderId: order._id, phone: order.customerInfo.phone, name: order.customerInfo.name,
      reviews: this.reviewDrafts().map(draft => ({ productId: draft.productId, rating: draft.rating,
        comment: [draft.title.trim(), draft.comment.trim()].filter(Boolean).join('\n') }))
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.reviewedOrders.update(ids => new Set([...ids, order._id!]));
        this.reviewOrder.set(null);
        this.reviewSubmitting.set(false);
      },
      error: err => {
        this.reviewSubmitting.set(false);
        this.reviewDrafts.update(drafts => drafts.map(draft => ({ ...draft, busy: false })));
        this.reviewError.set(err.error?.message || 'Không gửi được đánh giá. Vui lòng thử lại.');
        if (err.status === 409) this.reviewedOrders.update(ids => new Set([...ids, order._id!]));
      }
    });
  }
  private destroyRef = inject(DestroyRef);
  private lookupIdentity?: { phone: string; name: string };

  selectedStatus = signal<string>('all');
  lookupPhone = signal('');
  lookupName = signal('');
  lookupResults = signal<Order[]>([]);
  lookupDone = signal(false);
  justPlacedOrderId = signal('');
  showSuccessBanner = signal(false);
  detailOrder = signal<Order | null>(null);

  @ViewChild(CancelReasonDialogComponent) cancelReasonDialog!: CancelReasonDialogComponent;
  private cancellationDetails?: { reason: string; note: string };
  beginCancelOtp(details: { reason: string; note: string }) {
    this.cancellationDetails = details;
    this.cancelOtpDialog.nativeElement.showModal();
    this.sendCancelOtp();
  }
  onDeliveryUpdated() {
    if (this.authService.isLoggedIn()) this.orderService.fetchOrders();
    else this.searchByPhone();
  }
  @ViewChild('cancelOtpDialog') cancelOtpDialog!: ElementRef<HTMLDialogElement>;
  selectedCancelOrder = signal<Order | null>(null);
  cancelOtp = signal('');
  otpError = signal('');
  otpSent = signal(false);
  otpDemoCode = signal('');
  otpBusy = signal(false);
  otpSuccess = signal(false);
  maskedPhone = signal('');
  resendSeconds = signal(0);
  private resendTimer?: ReturnType<typeof setInterval>;

  ngOnDestroy() { clearInterval(this.resendTimer); }

  sendCancelOtp() {
    const order = this.selectedCancelOrder();
    if (!order?._id || this.otpBusy() || this.resendSeconds()) return;
    if (this.otpSent()) this.cancelOtp.set('');
    this.otpBusy.set(true);
    this.otpError.set('');
    this.orderService.requestCancelOtp(order._id, order.customerInfo.phone, order.customerInfo.name).subscribe({
      next: result => {
        this.otpBusy.set(false);
        this.otpSent.set(true);
        this.otpDemoCode.set(result.isDemo ? result.demoCode || '' : '');
        this.maskedPhone.set(result.maskedPhone);
        this.resendSeconds.set(result.retryAfter);
        clearInterval(this.resendTimer);
        this.resendTimer = setInterval(() => {
          this.resendSeconds.update(seconds => Math.max(0, seconds - 1));
          if (!this.resendSeconds()) clearInterval(this.resendTimer);
        }, 1000);
      },
      error: err => {
        this.otpBusy.set(false);
        this.otpError.set(err.status === 0 ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err.error?.message || 'Không gửi được OTP.');
      }
    });
  }

  updateCancelOtp(event: Event) {
    const input = event.target as HTMLInputElement;
    const code = input.value.replace(/\D/g, '').slice(0, 4);
    input.value = code;
    this.cancelOtp.set(code);
    this.otpError.set('');
  }

  confirmCancelOtp() {
    const order = this.selectedCancelOrder();
    if (!order?._id || this.otpBusy() || !/^\d{4}$/.test(this.cancelOtp())) return;
    this.otpBusy.set(true);
    this.otpError.set('');
    this.orderService.cancelOrder(order._id, this.cancelOtp(), this.cancellationDetails).subscribe({
      next: () => { this.otpBusy.set(false); this.otpSuccess.set(true); clearInterval(this.resendTimer); if (this.authService.isLoggedIn()) this.orderService.fetchOrders(); else this.searchByPhone(); },
      error: err => { this.otpBusy.set(false); this.otpError.set(err.status === 0 ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err.error?.message || 'Không thể hủy đơn hàng.'); }
    });
  }


  ngOnInit() {
    if (this.authService.isLoggedIn()) {
      this.orderService.fetchOrders();
    }

    const params = this.route.snapshot.queryParams;
    if (params['justPlaced']) {
      this.justPlacedOrderId.set(params['justPlaced']);
      this.showSuccessBanner.set(true);
      setTimeout(() => this.showSuccessBanner.set(false), 5000);
    }
    if (!this.authService.isLoggedIn() && params['phone'] && params['name']) {
      this.lookupPhone.set(params['phone']);
      this.lookupName.set(params['name']);
      this.searchByPhone();
    }
    interval(15000).pipe(
      switchMap(() => {
        if (document.hidden) return EMPTY;
        if (this.authService.isLoggedIn()) {
          return this.orderService.refreshOrders().pipe(catchError(() => EMPTY));
        }
        const identity = this.lookupIdentity;
        if (!identity) return EMPTY;
        return this.orderService.lookupOrders(identity.phone, identity.name).pipe(
          tap(orders => this.lookupResults.set(orders)),
          catchError(() => EMPTY)
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  private readonly PROCESSING_TAB = ['Đang xử lý', 'Đã đặt'];
  private readonly SHIPPING = ['Đang giao', 'Sẵn sàng lấy'];

  filteredOrders = computed(() => {
    const status = this.selectedStatus();
    const allOrders = this.authService.isLoggedIn() ? this.orderService.orders() : this.lookupResults();
    if (status === 'all') return allOrders;
    if (status === 'processing') return allOrders.filter(o => this.PROCESSING_TAB.includes(o.status));
    if (status === 'shipping') return allOrders.filter(o => this.SHIPPING.includes(o.status));
    if (status === 'Hoàn thành') return allOrders.filter(o => ['Hoàn thành', 'Đã hủy'].includes(o.status));
    return allOrders.filter(o => o.status === status);
  });

  statusCounts = computed(() => {
    const allOrders = this.authService.isLoggedIn() ? this.orderService.orders() : this.lookupResults();
    return {
      all: allOrders.length,
      processing: allOrders.filter(o => this.PROCESSING_TAB.includes(o.status)).length,
      confirmed: allOrders.filter(o => o.status === 'Đã xác nhận').length,
      preparing: allOrders.filter(o => o.status === 'Đang chuẩn bị').length,
      shipping: allOrders.filter(o => this.SHIPPING.includes(o.status)).length,
      completed: allOrders.filter(o => ['Hoàn thành', 'Đã hủy'].includes(o.status)).length
    };
  });

  getProgressPercent(status: string): number {
    const map: Record<string, number> = {
      'Đã đặt': 0,
      'Đã xác nhận': 25,
      'Đang chuẩn bị': 50,
      'Đã đóng gói': 62,
      'Đang giao': 75,
      'Sẵn sàng lấy': 75,
      'Hoàn thành': 100
    };
    return map[status] ?? 0;
  }

  searchByPhone() {
    const phone = this.lookupPhone().trim();
    const name = this.lookupName().trim();
    if (!phone || !name) return;
    this.orderService.lookupOrders(phone, name).subscribe({
      next: orders => { this.lookupIdentity = { phone, name }; this.lookupResults.set(orders); this.lookupDone.set(true); },
      error: () => { this.lookupResults.set([]); this.lookupDone.set(true); },
    });
  }

  formatPrice(price: number): string {
    return price ? price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + 'đ' : '0đ';
  }

  canCancel(order: any): boolean {
    return this.PROCESSING_TAB.includes(order.status);
  }

  openDetail(order: Order) { this.detailOrder.set(order); }
  closeDetail() { this.detailOrder.set(null); }

  getPaymentLabel(method?: string): string {
    const map: Record<string, string> = { cash: 'Tiền mặt', momo: 'MoMo', zalopay: 'ZaloPay', wallet: 'Ví điện tử' };
    return map[method || 'cash'] || method || 'Tiền mặt';
  }

  reorder(order: Order) {
    let count = 0;
    for (const item of order.items || []) {
      // item.id có dạng "12_{...options}" — lấy lại productId gốc từ tiền tố
      const productId = parseInt(String(item.id).split('_')[0], 10) || 0;
      const toppings = item.options?.toppings || [];
      const toppingsPrice = toppings.reduce((acc: number, t: any) => acc + (t.price * t.quantity), 0);
      // Dùng giá LƯU TRONG ĐƠN: suy ngược basePrice để addToCart tính ra đúng giá cũ
      // (hộp 99/100 bị addToCart nhân 0.9 nên phải chia ngược lại)
      let basePrice = item.price - toppingsPrice;
      if (productId === 99 || productId === 100) {
        basePrice = Math.round(item.price / 0.9) - toppingsPrice;
      }
      const fakeProduct = {
        id: productId,
        name: item.name,
        price: basePrice,
        basePrice: basePrice,
        image: item.image
      };
      this.cartService.addToCart(fakeProduct, item.quantity, {
        heating: item.options?.heating || 'Không',
        toppings: toppings
      });
      count++;
    }
    alert(`Đã thêm ${count} món vào giỏ hàng từ đơn cũ!`);
    this.router.navigate(['/checkout']);
  }

  // ---- Khiếu nại trong 2 giờ kể từ khi "Hoàn thành" ----
  private readonly COMPLAINT_WINDOW_MS = 2 * 60 * 60 * 1000;

  complaintOrder = signal<Order | null>(null);
  complaintReason = signal('Thiếu sản phẩm');
  complaintDesc = signal('');
  complaintPhoto = signal('');
  complaintSending = signal(false);
  complaintError = signal('');
  complaintUploading = signal(false);

  onComplaintPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.complaintUploading.set(true);
    this.complaintError.set('');
    this.complaintService.uploadPhoto(file).subscribe({
      next: res => {
        this.complaintPhoto.set(environment.apiBase + res.url);
        this.complaintUploading.set(false);
      },
      error: (err: any) => {
        this.complaintUploading.set(false);
        this.complaintError.set(err.error?.message || 'Upload ảnh thất bại.');
      }
    });
  }
  readonly complaintReasons = ['Thiếu sản phẩm', 'Sai vị', 'Sai topping', 'Móp vỡ', 'Không đảm bảo vệ sinh', 'Khác'];

  private completedAt(order: any): number | null {
    const entry = (order.statusHistory || []).find((h: any) => h.status === 'Hoàn thành');
    return entry?.at ? new Date(entry.at).getTime() : null;
  }

  canComplain(order: any): boolean {
    if (order.status !== 'Hoàn thành') return false;
    const at = this.completedAt(order);
    if (at === null) return false;
    return Date.now() - at <= this.COMPLAINT_WINDOW_MS;
  }

  complaintMinutesLeft(order: any): number {
    const at = this.completedAt(order);
    if (at === null) return 0;
    return Math.max(0, Math.ceil((at + this.COMPLAINT_WINDOW_MS - Date.now()) / 60000));
  }

  openComplaint(order: Order) {
    this.complaintOrder.set(order);
    this.complaintReason.set('Thiếu sản phẩm');
    this.complaintDesc.set('');
    this.complaintPhoto.set('');
    this.complaintError.set('');
  }

  closeComplaint() { this.complaintOrder.set(null); }

  submitComplaint() {
    const order = this.complaintOrder();
    if (!order || this.complaintSending()) return;
    this.complaintSending.set(true);
    this.complaintError.set('');
    this.complaintService.postComplaint({
      orderId: order._id!,
      reason: this.complaintReason(),
      description: this.complaintDesc().trim(),
      photoUrl: this.complaintPhoto().trim()
    }).subscribe({
      next: () => {
        this.complaintSending.set(false);
        this.complaintOrder.set(null);
        alert('Đã gửi khiếu nại! Cửa hàng sẽ liên hệ với bạn sớm nhất.');
      },
      error: (err) => {
        this.complaintSending.set(false);
        this.complaintError.set(err.error?.message || 'Không thể gửi khiếu nại.');
      }
    });
  }

  cancelOrder(id: string) {
    const order = (this.authService.isLoggedIn() ? this.orderService.orders() : this.lookupResults()).find(row => row._id === id);
    if (!order || !this.canCancel(order)) return;
    this.selectedCancelOrder.set(order);
    this.cancelOtp.set('');
    this.otpError.set('');
    this.otpSent.set(false);
    this.otpDemoCode.set('');
    this.otpSuccess.set(false);
    this.maskedPhone.set('');
    clearInterval(this.resendTimer);
    this.resendSeconds.set(0);
    this.cancellationDetails = undefined;
    this.cancelReasonDialog.open(order);
  }


}
