import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { OrderService } from '../order.service';
import { CartService } from '../cart.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-payment-vnpay',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-vnpay.component.html',
  styleUrl: './payment-vnpay.component.css'
})
export class VNPayPaymentComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private orderService = inject(OrderService);
  private cartService = inject(CartService);
  private authService = inject(AuthService);

  order = signal<any>(null);
  isProcessing = signal(false);
  orderDescription = signal<string>('');

  timeLeft = signal<number>(750); // 12 minutes 30 seconds
  minutes = signal<string>('12');
  seconds = signal<string>('30');
  private timerInterval: any = null;

  ngOnInit() {
    const raw = localStorage.getItem('pendingOrder');
    if (!raw) {
      alert('Không tìm thấy thông tin giao dịch!');
      this.router.navigate(['/checkout']);
      return;
    }
    try {
      const o = JSON.parse(raw);
      this.order.set(o);
      this.orderDescription.set(`Lịm Donuts Mã đơn hàng ${o.orderId}`);
      this.startTimer();
    } catch (_) {
      alert('Thông tin giao dịch không hợp lệ!');
      this.router.navigate(['/checkout']);
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      const val = this.timeLeft() - 1;
      if (val <= 0) {
        this.stopTimer();
        alert('Giao dịch đã hết hạn thanh toán!');
        this.cancelPayment();
      } else {
        this.timeLeft.set(val);
        this.minutes.set(Math.floor(val / 60).toString().padStart(2, '0'));
        this.seconds.set((val % 60).toString().padStart(2, '0'));
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatPrice(price: number): string {
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  confirmPayment() {
    const o = this.order();
    if (!o || this.isProcessing()) return;
    this.isProcessing.set(true);

    o.paymentStatus = 'paid';
    o.depositPaid = true;

    this.orderService.addOrder(o).subscribe({
      next: (created) => {
        localStorage.removeItem('pendingOrder');
        if (o.orderType === 'custom') sessionStorage.removeItem('customPartyPaymentDraft');
        localStorage.removeItem('pendingReferralDiscount');
        if (o.orderType !== 'custom') this.cartService.removePurchasedItems(o.items);

        if (this.authService.isLoggedIn()) {
          this.authService.fetchMe().subscribe({ error: () => { } });
          this.router.navigate(['/orders']);
        } else {
          if (o.orderType !== 'custom') localStorage.setItem('guestCheckoutInfo', JSON.stringify({
            name: o.customerInfo.name,
            phone: o.customerInfo.phone,
            address: o.customerInfo.address
          }));
          this.router.navigate(['/orders'], {
            queryParams: {
              phone: o.customerInfo.phone,
              name: o.customerInfo.name,
              justPlaced: created.orderId
            }
          });
        }
      },
      error: (err) => {
        this.isProcessing.set(false);
        alert('Đã xảy ra lỗi khi tạo đơn hàng: ' + (err.error?.message || err.message));
      }
    });
  }

  cancelPayment() {
    if (this.isProcessing()) return;
    const target = this.order()?.orderType === 'custom' ? '/custom-party' : '/checkout';
    localStorage.removeItem('pendingOrder');
    this.router.navigate([target]);
  }
}
