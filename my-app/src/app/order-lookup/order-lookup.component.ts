import { CancelReasonDialogComponent } from '../cancel-reason-dialog.component';
import { Component, inject, signal, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { OrderService, Order } from '../order.service';

@Component({
  selector: 'app-order-lookup',
  standalone: true,
  imports: [CancelReasonDialogComponent, CommonModule, FormsModule, RouterModule],
  templateUrl: './order-lookup.component.html',
  styleUrl: './order-lookup.component.css',
})
export class OrderLookupComponent implements OnDestroy {
  private orderService = inject(OrderService);

  phone = signal('');
  name = signal('');
  results = signal<Order[]>([]);
  searched = signal(false);
  loading = signal(false);
  @ViewChild(CancelReasonDialogComponent) cancelReasonDialog!: CancelReasonDialogComponent;
  private cancellationDetails?: { reason: string; note: string };
  beginCancelOtp(details: { reason: string; note: string }) {
    this.cancellationDetails = details;
    this.cancelOtpDialog.nativeElement.showModal();
    this.sendCancelOtp();
  }
  onDeliveryUpdated() { this.search(); }
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
      next: () => { this.otpBusy.set(false); this.otpSuccess.set(true); clearInterval(this.resendTimer); this.search(); },
      error: err => { this.otpBusy.set(false); this.otpError.set(err.status === 0 ? 'Không thể kết nối máy chủ. Vui lòng thử lại.' : err.error?.message || 'Không thể hủy đơn hàng.'); }
    });
  }

  search() {
    const phone = this.phone().trim();
    const name = this.name().trim();
    if (!phone || !name) return;
    this.loading.set(true);
    this.orderService.lookupOrders(phone, name).subscribe({
      next: orders => { this.results.set(orders); this.searched.set(true); this.loading.set(false); },
      error: () => { this.results.set([]); this.searched.set(true); this.loading.set(false); },
    });
  }

  canCancel(order: any): boolean {
    return ['Đang xử lý', 'Đã đặt'].includes(order.status);
  }

  cancelOrder(id: string) {
    const order = this.results().find(row => row._id === id);
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

  formatPrice(price: number): string {
    return price ? price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ' : '0đ';
  }
}
