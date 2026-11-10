import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

export interface Order {
  _id: string;
  orderId: string;
  branchId?: string;
  branchName?: string;
  customerInfo: { name: string; phone: string; address: string; deliveryTime: string; notes?: string; isGift?: boolean; giftMessage?: string; hideGiftPrice?: boolean };
  items: any[];
  totalAmount: number;
  orderType: string;
  depositPercent: number;
  depositAmount: number;
  remainingAmount: number;
  depositPaid: boolean;
  deliveryMethod: string;
  evidencePhotoUrl: string | null;
  status: string;
  statusHistory: { status: string; at: string }[];
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiBase}/api/orders`;

  orders = signal<Order[]>([]);

  fetchAll() {
    this.http.get<Order[]>(`${this.API}?all=true`).subscribe({
      next: data => this.orders.set(data),
      error: err => console.error('Fetch orders failed', err)
    });
  }

  updateStatus(id: string, newStatus: string, evidencePhotoUrl?: string) {
    const body: any = { newStatus };
    if (evidencePhotoUrl) body.evidencePhotoUrl = evidencePhotoUrl;
    return this.http.patch<Order>(`${this.API}/${id}/status`, body);
  }
}
