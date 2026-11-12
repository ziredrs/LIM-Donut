import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { OrderService, Order } from '../order.service';
import { AdminAuthService } from '../admin-auth.service';
import { environment } from '../../environments/environment';

const VALID_TRANSITIONS: Record<string, string[]> = {
  'Đã đặt': ['Đã xác nhận'],
  'Đã xác nhận': ['Đang chuẩn bị'],
  'Đang chuẩn bị': ['Đã đóng gói'],
  'Đã đóng gói': ['Đang giao', 'Sẵn sàng lấy'],
  'Đang giao': ['Hoàn thành'],
  'Sẵn sàng lấy': ['Hoàn thành'],
};

const COLUMNS = ['Đã đặt', 'Đã xác nhận', 'Đang chuẩn bị', 'Đã đóng gói', 'Đang giao', 'Sẵn sàng lấy', 'Hoàn thành'];
const EXCEPTION_STATUSES = ['Giao thất bại', 'Không tới lấy', 'Đã hủy'];

@Component({
  selector: 'app-order-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-board.component.html',
  styleUrl: './order-board.component.css',
})
export class OrderBoardComponent implements OnInit {
  orderService = inject(OrderService);
  private auth = inject(AdminAuthService);
  columns = COLUMNS;
  imageBase = environment.apiBase + '/';

  getItemImageUrl(imagePath: string): string {
    if (!imagePath) return 'avata.jpeg';
    if (imagePath.startsWith('http')) return imagePath;
    return imagePath.replace(/^uploads\//, '');
  }

  private http = inject(HttpClient);
  showPhotoModal = signal(false);
  photoUrl = signal('');
  uploading = signal(false);
  uploadError = signal('');

  onPhotoFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set('');
    const form = new FormData();
    form.append('photo', file);
    this.http.post<{ url: string }>(`${environment.apiBase}/api/upload`, form).subscribe({
      next: res => {
        this.photoUrl.set(environment.apiBase + res.url);
        this.uploading.set(false);
      },
      error: err => {
        this.uploading.set(false);
        this.uploadError.set(err.error?.message || 'Upload ảnh thất bại.');
      }
    });
  }
  pendingOrder = signal<Order | null>(null);
  pendingStatus = signal('');
  selectedOrderForDetails = signal<Order | null>(null);

  ngOnInit() {
    this.orderService.fetchAll();
  }

  viewOrderDetails(order: Order, event: Event) {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    this.selectedOrderForDetails.set(order);
  }

  closeOrderDetails() {
    this.selectedOrderForDetails.set(null);
  }

  logout() { this.auth.logout(); }

  ordersByStatus(status: string): Order[] {
    return this.orderService.orders().filter(o => o.status === status);
  }

  nextStatuses(order: Order): string[] {
    if (order.status === 'Đã đóng gói') {
      return order.deliveryMethod === 'pickup' ? ['Sẵn sàng lấy'] : ['Đang giao'];
    }
    return VALID_TRANSITIONS[order.status] || [];
  }

  exceptionStatuses(order: Order): string[] {
    if (['Hoàn thành', ...EXCEPTION_STATUSES, 'Thanh toán thất bại', 'Đã hoàn tiền'].includes(order.status)) return [];
    const result: string[] = [];
    if (['Đang giao'].includes(order.status)) result.push('Giao thất bại');
    if (['Sẵn sàng lấy'].includes(order.status)) result.push('Không tới lấy');
    if (!['Hoàn thành'].includes(order.status)) result.push('Đã hủy');
    return result;
  }

  transition(order: Order, newStatus: string) {
    if (newStatus === 'Đã đóng gói') {
      this.pendingOrder.set(order);
      this.pendingStatus.set(newStatus);
      this.photoUrl.set('');
      this.showPhotoModal.set(true);
      return;
    }
    this.doTransition(order._id, newStatus);
  }

  confirmPhoto() {
    const order = this.pendingOrder();
    if (!order || !this.photoUrl()) return;
    this.doTransition(order._id, this.pendingStatus(), this.photoUrl());
    this.showPhotoModal.set(false);
  }

  private doTransition(id: string, newStatus: string, evidencePhotoUrl?: string) {
    this.orderService.updateStatus(id, newStatus, evidencePhotoUrl).subscribe({
      next: () => this.orderService.fetchAll(),
      error: err => alert(err.error?.message || 'Lỗi chuyển trạng thái')
    });
  }

  formatPrice(price: number): string {
    return price?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
  }

  exportCSV() {
    const orders = this.orderService.orders();
    if (!orders.length) { alert('Không có đơn hàng.'); return; }
    const header = ['Mã đơn', 'Khách hàng', 'SĐT', 'Trạng thái', 'Phương thức', 'Tổng tiền', 'Ngày tạo'];
    const rows = orders.map((o: Order) => [
      o.orderId, o.customerInfo.name, o.customerInfo.phone, o.status,
      o.deliveryMethod, o.totalAmount, new Date(o.createdAt).toLocaleString('vi-VN')
    ]);
    const csv = '﻿' + [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `donhang_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  columnIcon(status: string): string {
    const map: Record<string, string> = {
      'Đã đặt': 'bi-inbox-fill',
      'Đã xác nhận': 'bi-check-circle-fill',
      'Đang chuẩn bị': 'bi-clock-fill',
      'Đã đóng gói': 'bi-box-seam-fill',
      'Đang giao': 'bi-truck',
      'Sẵn sàng lấy': 'bi-shop',
      'Hoàn thành': 'bi-star-fill',
    };
    return map[status] || 'bi-circle';
  }
}
