import { Component, OnInit, OnDestroy, inject, signal, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { CartService } from '../cart.service';
import { ProductService, Product } from '../product.service';
import { ReviewService, Review } from '../review.service';
import { AuthService } from '../auth.service';
import { ImgUrlPipe } from '../img-url.pipe';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ImgUrlPipe],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css'
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  product: Product | undefined;
  productImages: string[] = [];
  currentImageIndex: number = 0;
  relatedProducts: Product[] = [];
  activeTab: string = 'description'; 
  public cartService = inject(CartService);
  public productService = inject(ProductService);
  private reviewService = inject(ReviewService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  authService = inject(AuthService);

  // Selections
  selectedHeating: string = 'Không';
  selectedToppings: { name: string, price: number, quantity: number }[] = [];
  quantity: number = 1;
  
  reviews = signal<Review[]>([]);
  
  extraToppingsList = [
    { name: 'Sốt Socola', price: '5.000' },
    { name: 'Sốt Caramel', price: '5.000' },
    { name: 'Hạt điều rang', price: '10.000' },
    { name: 'Vụn bánh quy', price: '5.000' }
  ];

  get products(): Product[] { return this.productService.getProducts(); }

  selectedBoxDonuts: {
    productId?: number;
    name?: string;
    price?: number;
    image?: string;
    heating: string;
    toppings: { name: string, price: number, quantity: number }[];
    selectableToppings?: { name: string, price: string }[];
  }[] = [];

  constructor(private route: ActivatedRoute) {
    // Khi danh sách sản phẩm (signal) tải xong sau khi vào trang, tìm lại sản phẩm theo id trên URL.
    // setTimeout để không gán this.product giữa chu trình change detection (tránh NG0100)
    effect(() => {
      this.productService.getProducts();
      setTimeout(() => this.tryLoadProduct());
    });
  }

  // Giờ vàng: tick mỗi giây cho đồng hồ đếm ngược
  readonly flashTick = signal(0);
  private flashTimer: any = null;

  isFlashSale(): boolean {
    this.flashTick();
    return this.product ? this.productService.isFlashSaleActive(this.product) : false;
  }

  flashCountdown(): string {
    this.flashTick();
    if (!this.product) return '00:00';
    const s = this.productService.flashSaleSecondsLeft(this.product);
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    if (this.flashTimer) clearInterval(this.flashTimer);
  }

  private routeProductId: number | null = null;

  ngOnInit(): void {
    this.flashTimer = setInterval(() => this.flashTick.update(v => v + 1), 1000);
    this.route.paramMap.subscribe(params => {
      this.routeProductId = Number(params.get('id'));
      this.product = undefined;
      this.tryLoadProduct();
    });
  }

  /** Danh sách sản phẩm tải async từ API — thử tìm lại khi dữ liệu về (gọi từ effect) */
  private tryLoadProduct(): void {
    if (this.routeProductId === null || this.product) return;
    this.product = this.products.find(p => p.id === this.routeProductId);
    if (this.product) {
      this.productImages = [this.product.image, this.product.image, this.product.image];
      this.currentImageIndex = 0;
      this.loadRelatedProducts();
      window.scrollTo(0, 0);
      this.selectedHeating = 'Không';
      this.selectedToppings = [];
      this.quantity = 1;
      this.initializeBoxSlots();
      this.loadReviews(this.product.id);
      // App chạy zoneless — báo cho scheduler render lại sau khi gán product ngoài chu trình CD
      this.cdr.markForCheck();
    }
  }

  initializeBoxSlots(): void {
    const capacity = this.maxBoxDonutsCapacity;
    this.selectedBoxDonuts = Array.from({ length: capacity }, () => ({
      productId: undefined,
      name: undefined,
      price: undefined,
      image: undefined,
      heating: 'Không',
      toppings: [],
      selectableToppings: []
    }));
  }

  get maxBoxDonutsCapacity(): number {
    if (!this.product) return 0;
    if (this.product.id === 99) return 4;
    if (this.product.id === 100) return 6;
    return 0;
  }

  get totalBoxDonutsCount(): number {
    return this.selectedBoxDonuts.filter(s => s.productId !== undefined).length;
  }

  get selectableDonuts(): Product[] {
    return this.products.filter(p => p.id !== 99 && p.id !== 100);
  }

  getBoxDonutQuantity(productId: number): number {
    return this.selectedBoxDonuts.filter(s => s.productId === productId).length;
  }

  addBoxDonut(donut: Product): void {
    const emptySlot = this.selectedBoxDonuts.find(s => s.productId === undefined);
    if (!emptySlot) {
      alert(`Hộp đã đầy! Bạn chỉ có thể chọn tối đa ${this.maxBoxDonutsCapacity} bánh.`);
      return;
    }
    const priceNum = parseInt(donut.price.replace(/\./g, ''));
    emptySlot.productId = donut.id;
    emptySlot.name = donut.name;
    emptySlot.price = priceNum;
    emptySlot.image = donut.image;
    emptySlot.heating = 'Không';
    emptySlot.toppings = [];
    emptySlot.selectableToppings = donut.toppings || [];
  }

  removeBoxDonut(productId: number): void {
    const lastIndex = this.selectedBoxDonuts.map(s => s.productId).lastIndexOf(productId);
    if (lastIndex > -1) {
      this.clearSlot(lastIndex);
    }
  }

  clearSlot(index: number): void {
    this.selectedBoxDonuts[index] = {
      productId: undefined,
      name: undefined,
      price: undefined,
      image: undefined,
      heating: 'Không',
      toppings: [],
      selectableToppings: []
    };
  }

  selectSlotHeating(index: number, level: string): void {
    this.selectedBoxDonuts[index].heating = level;
  }

  getSlotToppingQuantity(slotIndex: number, toppingName: string): number {
    const topping = this.selectedBoxDonuts[slotIndex].toppings.find(t => t.name === toppingName);
    return topping ? topping.quantity : 0;
  }

  addSlotTopping(slotIndex: number, toppingName: string, toppingPrice: string): void {
    const priceNum = parseInt(toppingPrice.replace('.', ''));
    const slot = this.selectedBoxDonuts[slotIndex];
    const existing = slot.toppings.find(t => t.name === toppingName);
    if (existing) {
      existing.quantity++;
    } else {
      slot.toppings.push({ name: toppingName, price: priceNum, quantity: 1 });
    }
  }

  removeSlotTopping(slotIndex: number, toppingName: string): void {
    const slot = this.selectedBoxDonuts[slotIndex];
    const index = slot.toppings.findIndex(t => t.name === toppingName);
    if (index > -1) {
      if (slot.toppings[index].quantity > 1) {
        slot.toppings[index].quantity--;
      } else {
        slot.toppings.splice(index, 1);
      }
    }
  }

  applyToAllSlots(sourceIndex: number): void {
    const source = this.selectedBoxDonuts[sourceIndex];
    if (source.productId === undefined) return;
    this.selectedBoxDonuts.forEach((slot, i) => {
      if (i === sourceIndex || slot.productId === undefined) return;
      slot.heating = source.heating;
      const validNames = (slot.selectableToppings || []).map(t => t.name);
      slot.toppings = source.toppings
        .filter(t => validNames.includes(t.name))
        .map(t => ({ name: t.name, price: t.price, quantity: t.quantity }));
    });
  }

  canApplyToAll(index: number): boolean {
    const slot = this.selectedBoxDonuts[index];
    if (slot.productId === undefined) return false;
    const hasCustom = slot.heating !== 'Không' || slot.toppings.length > 0;
    const filledCount = this.selectedBoxDonuts.filter(s => s.productId !== undefined).length;
    return hasCustom && filledCount >= 2;
  }

  get mainImage(): string {
    return this.productImages[this.currentImageIndex] || '';
  }

  nextImage(): void {
    if (this.productImages.length > 0) {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.productImages.length;
    }
  }

  prevImage(): void {
    if (this.productImages.length > 0) {
      this.currentImageIndex = (this.currentImageIndex - 1 + this.productImages.length) % this.productImages.length;
    }
  }

  setMainImageIndex(index: number): void {
    this.currentImageIndex = index;
  }

  loadRelatedProducts(): void {
    if (!this.product) return;
    
    // Filter products in the same categories, excluding the current one
    const sameCategory = this.products.filter(p => 
      p.id !== this.product?.id && 
      p.categories.some(cat => this.product?.categories.includes(cat))
    );

    // Shuffle and pick 4
    this.relatedProducts = sameCategory
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);
      
    // If not enough related products in the same category, add some random ones
    if (this.relatedProducts.length < 4) {
      const others = this.products.filter(p => 
        p.id !== this.product?.id && 
        !this.relatedProducts.find(rp => rp.id === p.id)
      );
      const extra = others
        .sort(() => Math.random() - 0.5)
        .slice(0, 4 - this.relatedProducts.length);
      this.relatedProducts = [...this.relatedProducts, ...extra];
    }
  }

  selectHeating(level: string): void {
    this.selectedHeating = level;
  }

  getToppingQuantity(name: string): number {
    const topping = this.selectedToppings.find(t => t.name === name);
    return topping ? topping.quantity : 0;
  }

  addTopping(name: string, price: string): void {
    const priceNum = parseInt(price.replace('.', ''));
    const existing = this.selectedToppings.find(t => t.name === name);
    if (existing) {
      existing.quantity++;
    } else {
      this.selectedToppings.push({ name, price: priceNum, quantity: 1 });
    }
  }

  removeTopping(name: string): void {
    const index = this.selectedToppings.findIndex(t => t.name === name);
    if (index > -1) {
      if (this.selectedToppings[index].quantity > 1) {
        this.selectedToppings[index].quantity--;
      } else {
        this.selectedToppings.splice(index, 1);
      }
    }
  }

  toggleTopping(name: string, price: string): void {
    const existing = this.selectedToppings.find(t => t.name === name);
    if (existing) {
      this.selectedToppings = this.selectedToppings.filter(t => t.name !== name);
    } else {
      const priceNum = parseInt(price.replace('.', ''));
      this.selectedToppings.push({ name, price: priceNum, quantity: 1 });
    }
  }

  increaseQuantity(): void {
    this.quantity++;
  }

  decreaseQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
    }
  }

  get currentPrice(): string {
    if (!this.product) return '0';
    
    if (this.product.id === 99 || this.product.id === 100) {
      let baseSum = 0;
      this.selectedBoxDonuts.forEach(slot => {
        if (slot.productId !== undefined && slot.price !== undefined) {
          baseSum += slot.price;
          const toppingsSum = slot.toppings.reduce((sum, t) => sum + (t.price * t.quantity), 0);
          baseSum += toppingsSum;
        }
      });
      const total = Math.round(baseSum * 0.9);
      return total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }
    
    let basePrice = parseInt(this.product.price.replace('.', ''));
    if (this.productService.isFlashSaleActive(this.product)) {
      basePrice = this.productService.getFlashSalePrice(this.product);
    }
    const toppingsPrice = this.selectedToppings.reduce((acc, t) => acc + (t.price * t.quantity), 0);
    const total = (basePrice + toppingsPrice);
    return total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  get vipPrice(): string {
    if (!this.product) return '0';
    const total = parseInt(this.currentPrice.replace(/\./g, ''));
    const vip = Math.round(total * 0.85);
    return vip.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /** Thành tiền = đơn giá hiện tại × số lượng */
  get totalPrice(): string {
    const unit = parseInt(this.currentPrice.replace(/\./g, ''), 10) || 0;
    const total = unit * this.quantity;
    return total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /** Nhãn "đã bán" rút gọn: 2000 -> '2k', 1500 -> '1.5k' */
  get soldLabel(): string {
    const n = this.product?.sold ?? 0;
    if (n < 1000) return n.toString();
    return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  toggleFavorite() {
    if (!this.product) return;
    const obs = this.authService.toggleFavorite(this.product.id);
    if (obs) obs.subscribe();
  }

  isFavorite(): boolean {
    return this.product ? this.authService.isFavorite(this.product.id) : false;
  }

  addToCart(): boolean {
    if (this.product) {
      if (this.productService.isOutOfStock(this.product)) {
        alert(`"${this.product.name}" đã hết hàng hôm nay! Vui lòng chọn sản phẩm khác.`);
        return false;
      }
      const options: any = {
        heating: this.selectedHeating,
        toppings: this.selectedToppings
      };

      let productToSend = { ...this.product };

      if (this.product.id === 99 || this.product.id === 100) {
        if (this.totalBoxDonutsCount !== this.maxBoxDonutsCapacity) {
          alert(`Vui lòng chọn đủ ${this.maxBoxDonutsCapacity} vị bánh cho hộp của bạn.`);
          return false;
        }
        options.boxDonuts = this.selectedBoxDonuts.map(d => ({
          productId: d.productId,
          name: d.name,
          price: d.price,
          image: d.image,
          heating: d.heating,
          toppings: d.toppings.map(t => ({
            name: t.name,
            price: t.price,
            quantity: t.quantity
          }))
        }));
        
        // Calculate undiscounted base sum of all donuts and toppings inside the slots to send to cart
        let baseSum = 0;
        this.selectedBoxDonuts.forEach(slot => {
          if (slot.productId !== undefined && slot.price !== undefined) {
            baseSum += slot.price;
            const toppingsSum = slot.toppings.reduce((sum, t) => sum + (t.price * t.quantity), 0);
            baseSum += toppingsSum;
          }
        });
        
        productToSend.price = baseSum.toString();
        productToSend.basePrice = baseSum.toString();
      }
      
      this.cartService.addToCart(productToSend, this.quantity, options);
      this.productService.decreaseStock(this.product.id, this.quantity);
      return true;
    }
    return false;
  }

  /** Thêm vào giỏ rồi đi thẳng tới trang thanh toán */
  buyNow(): void {
    if (this.addToCart()) {
      this.router.navigate(['/checkout']);
    }
  }

  /** Mua nhanh một sản phẩm (dùng cho các card gợi ý) */
  buyNowProduct(p: Product): void {
    this.cartService.addToCart(p);
    this.router.navigate(['/checkout']);
  }

  loadReviews(productId: number): void {
    this.reviewService.getReviews(productId).subscribe({
      next: (reviews) => {
        this.reviews.set(reviews);
        this.syncRatingFromReviews(reviews);
      },
      error: () => this.reviews.set([])
    });
  }

  /** Đồng bộ rating/số review hiển thị với dữ liệu review thật (thay số tĩnh) */
  private syncRatingFromReviews(reviews: Review[]): void {
    if (!this.product) return;
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    this.product.rating = Math.round(avg);
    this.product.reviews = String(reviews.length);
  }

  reviewAverage(): number {
    const reviews = this.reviews();
    return reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  }

  reviewPercent(star: number): number {
    const reviews = this.reviews();
    return reviews.length ? reviews.filter(review => review.rating === star).length / reviews.length * 100 : 0;
  }
}
