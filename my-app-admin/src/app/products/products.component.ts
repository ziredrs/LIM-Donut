import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductsService, AdminProduct, Topping, FlashSale, Category } from './products.service';
import { environment } from '../../environments/environment';

const LABELS_OPTIONS = ['Nhân chảy', 'Mặn', 'Đậm cà phê', 'Vị trà', 'Socola', 'Matcha', 'Phô mai', 'Trái cây', 'Best seller', 'Mới'];
const DIETARY_OPTIONS = ['Chay', 'Không gluten', 'Ít ngọt', 'Cho trẻ em', 'Ít calo'];
const ALLERGENS_OPTIONS = ['Gluten', 'Sữa', 'Trứng', 'Hạt cây', 'Đậu nành', 'Hải sản'];
const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrl: './products.component.css'
})
export class ProductsComponent implements OnInit {
  service = inject(ProductsService);
  imageBase = environment.apiBase + '/';

  search = signal('');
  savingId = signal<number | null>(null);
  editing = signal<AdminProduct | null>(null);
  showAddForm = signal(false);
  showCatManager = signal(false);
  uploading = signal(false);
  newCatName = '';

  labelsOptions = LABELS_OPTIONS;
  dietaryOptions = DIETARY_OPTIONS;
  allergensOptions = ALLERGENS_OPTIONS;
  daysOfWeek = DAYS;

  newProduct: Partial<AdminProduct> = this.emptyProduct();
  pageSize = 8;
  currentPage = 1;

  ngOnInit() {
    this.service.fetchBranches();
    this.service.fetchAll();
    this.service.fetchCategories();
  }

  get filtered(): AdminProduct[] {
    const term = this.search().trim().toLowerCase();
    const list = this.service.products();
    if (!term) return list;
    return list.filter(p => p.name.toLowerCase().includes(term));
  }

  get totalPages(): number { return Math.ceil(this.filtered.length / this.pageSize); }
  get pagesArray(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }
  get pagedProducts(): AdminProduct[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  goToPage(p: number) { if (p >= 1 && p <= this.totalPages) this.currentPage = p; }

  emptyProduct(): Partial<AdminProduct> {
    return {
      name: '', price: '', basePrice: '', image: '', stock: 50, description: '',
      categories: [], labels: [], dietary: [], allergens: [],
      nutrition: { calories: 0, sugar: 0, fat: 0, protein: 0 },
      toppings: [], flashSale: null
    };
  }

  openDetail(p: AdminProduct) {
    this.editing.set(JSON.parse(JSON.stringify(p)));
  }

  closeDetail() { this.editing.set(null); }

  toggleArrayItem(arr: string[], item: string) {
    const idx = arr.indexOf(item);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
  }

  addTopping(product: any) {
    if (!product.toppings) product.toppings = [];
    product.toppings.push({ name: '', price: '' });
  }

  removeTopping(product: any, i: number) {
    product.toppings.splice(i, 1);
  }

  toggleFlashSale(product: any) {
    if (product.flashSale) {
      product.flashSale = null;
    } else {
      product.flashSale = { discountPercent: 10, dayOfWeek: 1, startHour: 11, endHour: 13 };
    }
  }

  onFileSelected(event: Event, target: any, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.service.uploadImage(file).subscribe({
      next: res => { target[field] = res.url; this.uploading.set(false); },
      error: () => { alert('Lỗi upload ảnh'); this.uploading.set(false); }
    });
  }

  saveDetail() {
    const p = this.editing();
    if (!p) return;
    this.savingId.set(p.id);
    const { _id, id, sold, rating, reviews, ...data } = p as any;
    this.service.update(p.id, data).subscribe({
      next: () => { this.savingId.set(null); this.editing.set(null); this.service.fetchAll(); },
      error: err => { this.savingId.set(null); alert(err.error?.message || 'Lỗi khi lưu.'); }
    });
  }

  addProduct() {
    const np = this.newProduct;
    if (!np.name?.trim() || !np.price?.trim()) { alert('Vui lòng nhập tên và giá.'); return; }
    this.service.create(np).subscribe({
      next: () => { this.showAddForm.set(false); this.newProduct = this.emptyProduct(); this.service.fetchAll(); },
      error: err => alert(err.error?.message || 'Lỗi khi thêm.')
    });
  }

  remove(p: AdminProduct) {
    if (!confirm(`Xoá sản phẩm "${p.name}"?`)) return;
    this.service.remove(p.id).subscribe({
      next: () => this.service.fetchAll(),
      error: err => alert(err.error?.message || 'Lỗi khi xoá.')
    });
  }

  addCategory() {
    if (!this.newCatName.trim()) return;
    this.service.createCategory({ name: this.newCatName.trim(), icon: '', order: this.service.categories().length }).subscribe({
      next: () => { this.newCatName = ''; this.service.fetchCategories(); },
      error: err => alert(err.error?.message || 'Lỗi')
    });
  }

  deleteCategory(cat: Category) {
    if (!confirm(`Xoá danh mục "${cat.name}"?`)) return;
    this.service.deleteCategory(cat._id!).subscribe({
      next: () => this.service.fetchCategories(),
      error: err => alert(err.error?.message || 'Lỗi')
    });
  }
}
