import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

export interface Order {
  hasReviewed?: boolean;
  branchId?: string;
  cancellation?: { reason: string; note?: string; at?: string; paymentReviewRequired?: boolean };
  _id?: string;
  orderId: string;
  customerInfo: {
    name: string;
    phone: string;
    address: string;
    deliveryTime: string;
    notes: string;
    isGift?: boolean;
    giftMessage?: string;
    hideGiftPrice?: boolean;
  };
  items: any[];
  totalAmount: number;
  orderType?: string;
  depositPercent?: number;
  depositAmount?: number;
  remainingAmount?: number;
  deliveryMethod?: string;
  status: string;
  statusHistory?: { status: string; at: string }[];
  paymentMethod?: string;
  paymentStatus?: string;
  createdAt?: string;
}

export interface DeliveryChangeQuote {
  token: string; address: string; branchId: string; branchName: string;
  deliveryMethod: 'delivery' | 'pickup'; distanceKm: number;
  shippingFee: number; oldShippingFee: number; oldTotalAmount: number; totalAmount: number;
  depositAmount: number; depositPaid: boolean; remainingAmount: number;
  distanceSource?: 'google-driving' | 'straight-line' | 'pickup'; mapsUrl?: string;
  locationPrecision?: 'house' | 'street'; resolvedAddress?: string;
}
export interface OrderEditQuote {
  token: string; kind: 'time' | 'items'; deliveryTime?: string;
  items?: { name: string; price: number; quantity: number }[];
  oldTotalAmount: number; totalAmount: number; shippingFee?: number; voucherDiscount?: number;
  starsReturned?: number; depositAmount?: number; remainingAmount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private apiUrl = `${environment.apiBase}/api/orders`;

  private ordersSignal = signal<Order[]>([]);
  readonly orders = this.ordersSignal.asReadonly();

  refreshOrders() {
    return this.http.get<Order[]>(`${this.apiUrl}?mine=true`).pipe(
      tap(orders => this.ordersSignal.set(orders))
    );
  }

  fetchOrders() {
    if (!this.auth.isLoggedIn()) {
      this.ordersSignal.set([]);
      return;
    }
    this.refreshOrders().subscribe({
      error: () => this.ordersSignal.set([]),
    });
  }

  lookupOrders(phone: string, name: string) {
    return this.http.get<Order[]>(`${this.apiUrl}/lookup`, { params: { phone, name } });
  }

  requestCancelOtp(id: string, phone: string, name: string) {
    return this.http.post<{ maskedPhone: string; expiresIn: number; retryAfter: number; isDemo?: boolean; demoCode?: string }>(`${this.apiUrl}/${id}/cancel-otp`, { phone, name });
  }

  cancelOrder(id: string, otp?: string, cancellation?: { reason: string; note: string }) {
    return this.http.patch<Order>(`${this.apiUrl}/${id}/cancel`, { ...(otp === undefined ? {} : { otp }), ...cancellation });
  }

  quoteDeliveryChange(order: Order, data: { address: string; branchId: string; deliveryMethod: 'delivery' | 'pickup' }) {
    return this.http.post<DeliveryChangeQuote>(`${this.apiUrl}/${order._id}/delivery-change/quote`, { ...data, phone: order.customerInfo.phone, name: order.customerInfo.name });
  }

  confirmDeliveryChange(order: Order, token: string, locationConfirmed = false) {
    return this.http.post<Order>(`${this.apiUrl}/${order._id}/delivery-change/confirm`, { token, locationConfirmed, phone: order.customerInfo.phone, name: order.customerInfo.name });
  }
  quoteOrderEdit(order: Order, edit: { kind: 'time'; date: string; time: string } | { kind: 'items'; items: { sourceIndex: number | null; productId: number; quantity: number }[] }) {
    return this.http.post<OrderEditQuote>(`${this.apiUrl}/${order._id}/edit/quote`, { ...edit, phone: order.customerInfo.phone, name: order.customerInfo.name });
  }
  confirmOrderEdit(order: Order, token: string) {
    return this.http.post<Order>(`${this.apiUrl}/${order._id}/edit/confirm`, { token, phone: order.customerInfo.phone, name: order.customerInfo.name });
  }

  addOrder(order: Order) {
    return this.http.post<Order>(this.apiUrl, order).pipe(
      tap(newOrder => {
        this.ordersSignal.update(orders => [newOrder, ...orders]);
      })
    );
  }
}
