import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Topping { name: string; price: string; }

export interface FlashSale {
  discountPercent: number;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

export interface AdminProduct {
  _id?: string;
  id: number;
  name: string;
  description?: string;
  price: string;
  basePrice?: string;
  image?: string;
  categories?: string[];
  labels?: string[];
  dietary?: string[];
  allergens?: string[];
  nutrition?: { calories: number; sugar: number; fat: number; protein: number; };
  toppings?: Topping[];
  flashSale?: FlashSale | null;
  sold: number;
  stock: number;
  rating?: number;
  reviews?: string;
}

export interface Category {
  _id?: string;
  name: string;
  icon: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiBase}/api/products`;
  private catUrl = `${environment.apiBase}/api/categories`;

  products = signal<AdminProduct[]>([]);
  categories = signal<Category[]>([]);
  branches = signal<{ _id: string; name: string; active: boolean }[]>([]);
  branchId = signal('');
  inventory = signal<Record<number, number>>({});
  fetchBranches() {
    this.http.get<{ _id: string; name: string; active: boolean }[]>(`${environment.apiBase}/api/branches`).subscribe({ next: rows => this.branches.set(rows.filter(b => b.active)) });
  }
  fetchInventory() {
    this.inventory.set({});
    if (!this.branchId()) return;
    const branchId = this.branchId();
    this.http.get<{ productId: number; stock: number }[]>(`${environment.apiBase}/api/inventory/${branchId}`).subscribe({
      next: rows => { if (this.branchId() === branchId) this.inventory.set(Object.fromEntries(rows.map(row => [row.productId, row.stock]))); },
      error: () => alert('Không tải được tồn kho chi nhánh.')
    });
  }
  saveStock(productId: number, stock: number) {
    if (!this.branchId()) { alert('Vui lòng chọn chi nhánh.'); return; }
    this.http.put(`${environment.apiBase}/api/inventory/${this.branchId()}/${productId}`, { stock }).subscribe({
      next: () => { this.fetchInventory(); this.fetchAll(); }, error: err => alert(err.error?.message || 'Không lưu được tồn kho.')
    });
  }

  fetchAll() {
    this.http.get<AdminProduct[]>(this.apiUrl).subscribe({
      next: data => this.products.set(data),
      error: err => console.error('Fetch products error:', err)
    });
  }

  fetchCategories() {
    this.http.get<Category[]>(this.catUrl).subscribe({
      next: data => this.categories.set(data),
      error: err => console.error('Fetch categories error:', err)
    });
  }

  update(id: number, data: Partial<AdminProduct>) {
    return this.http.put<AdminProduct>(`${this.apiUrl}/${id}`, data);
  }

  create(data: Partial<AdminProduct>) {
    return this.http.post<AdminProduct>(this.apiUrl, data);
  }

  remove(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  createCategory(data: Partial<Category>) {
    return this.http.post<Category>(this.catUrl, data);
  }

  updateCategory(id: string, data: Partial<Category>) {
    return this.http.put<Category>(`${this.catUrl}/${id}`, data);
  }

  deleteCategory(id: string) {
    return this.http.delete(`${this.catUrl}/${id}`);
  }

  uploadImage(file: File) {
    const fd = new FormData();
    fd.append('image', file);
    return this.http.post<{ url: string }>(`${environment.apiBase}/api/upload`, fd);
  }
}
