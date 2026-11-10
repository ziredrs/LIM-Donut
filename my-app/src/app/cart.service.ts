import { Injectable, signal, computed } from '@angular/core';

export interface CartTopping {
  name: string;
  price: number;
  quantity: number;
}

export interface CartItem {
  selected?: boolean;
  id: string; // Unique key (id + hash of options)
  productId: number;
  name: string;
  basePrice: number;
  price: number; // Total price per unit including toppings (discounted for boxes)
  quantity: number;
  image: string;
  options: {
    heating: string;
    toppings: CartTopping[];
    boxDonuts?: {
      productId: number;
      name: string;
      price: number;
      image: string;
      heating: string;
      toppings: CartTopping[];
    }[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private cartItems = signal<CartItem[]>([]);
  
  // Signals for UI
  readonly items = this.cartItems.asReadonly();
  readonly selectedItems = computed(() => this.cartItems().filter(item => item.selected !== false));

  toggleSelection(id: string) {
    this.cartItems.update(items => items.map(item => item.id === id
      ? { ...item, selected: item.selected === false } : item));
  }

  removePurchasedItems(purchased: { id: string; quantity: number }[]) {
    this.cartItems.update(items => items.flatMap(item => {
      const bought = purchased.find(entry => entry.id === item.id);
      if (!bought) return [item];
      const quantity = item.quantity - bought.quantity;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  }
  
  readonly totalItems = computed(() => {
    return this.cartItems().reduce((acc, item) => acc + item.quantity, 0);
  });
  
  readonly totalPrice = computed(() => {
    return this.cartItems().reduce((acc, item) => acc + (item.price * item.quantity), 0);
  });
  
  // Notification state
  readonly notification = signal<{ message: string; visible: boolean }>({
    message: '',
    visible: false
  });

  private notificationTimeout: any;

  addToCart(product: any, quantity: number = 1, options?: any) {
    const currentItems = this.cartItems();
    let basePriceNum = parseInt(product.basePrice?.toString().replace(/\./g, '') || product.price.toString().replace(/\./g, ''));

    // Giờ vàng: dùng giá đã giảm làm giá gốc của item
    if (product.flashSale) {
      const now = new Date();
      const fs = product.flashSale;
      if (now.getDay() === fs.dayOfWeek && now.getHours() >= fs.startHour && now.getHours() < fs.endHour) {
        basePriceNum = Math.round(basePriceNum * (100 - fs.discountPercent) / 100);
      }
    }
    
    const defaultOptions = {
      heating: 'Không',
      toppings: [],
      boxDonuts: []
    };
    
    const finalOptions = JSON.parse(JSON.stringify({ ...defaultOptions, ...options }));
    
    // Calculate total price for this unit
    const toppingsPrice = finalOptions.toppings.reduce((acc: number, t: any) => acc + (t.price * t.quantity), 0);
    
    let unitPrice = basePriceNum + toppingsPrice;
    if (product.id === 99 || product.id === 100) {
      // 10% discount on total price (including toppings)
      unitPrice = Math.round((basePriceNum + toppingsPrice) * 0.9);
    }
    
    // Create a unique ID based on product ID and options
    const optionsKey = JSON.stringify(finalOptions);
    const cartItemId = `${product.id}_${optionsKey}`;
    
    const existingItem = currentItems.find(item => item.id === cartItemId);
    
    if (existingItem) {
      this.cartItems.update(items => items.map(item => 
        item.id === cartItemId ? { ...item, quantity: item.quantity + quantity } : item
      ));
    } else {
      const newItem: CartItem = {
        id: cartItemId,
        productId: product.id,
        name: product.name,
        basePrice: basePriceNum,
        price: unitPrice,
        quantity: quantity,
        image: product.image,
        options: finalOptions
      };
      this.cartItems.update(items => [...items, newItem]);
    }
    
    this.showNotification(`Thêm <strong>${product.name}</strong> vào giỏ hàng`);
  }

  updateQuantity(cartItemId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(cartItemId);
      return;
    }
    this.cartItems.update(items => items.map(item => 
      item.id === cartItemId ? { ...item, quantity } : item
    ));
  }

  removeFromCart(cartItemId: string) {
    this.cartItems.update(items => items.filter(item => item.id !== cartItemId));
  }

  removeOption(cartItemId: string, optionType: 'heating' | 'topping', toppingName?: string) {
    this.cartItems.update(items => {
      return items.map(item => {
        if (item.id !== cartItemId) return item;

        let newOptions = { ...item.options };
        if (optionType === 'heating') {
          newOptions.heating = 'Không';
        } else if (optionType === 'topping' && toppingName) {
          newOptions.toppings = newOptions.toppings.filter(t => t.name !== toppingName);
        }

        // Recalculate price
        const toppingsPrice = newOptions.toppings.reduce((acc: number, t: any) => acc + (t.price * t.quantity), 0);
        let newUnitPrice = item.basePrice + toppingsPrice;
        if (item.productId === 99 || item.productId === 100) {
          let boxTotal = 0;
          if (newOptions.boxDonuts) {
            newOptions.boxDonuts.forEach((d: any) => {
              boxTotal += d.price;
              const dToppings = d.toppings.reduce((sum: number, t: any) => sum + (t.price * t.quantity), 0);
              boxTotal += dToppings;
            });
          }
          newUnitPrice = Math.round(boxTotal * 0.9);
        }

        // Generate new unique ID for the item since options changed
        const newOptionsKey = JSON.stringify(newOptions);
        const newCartItemId = `${item.productId}_${newOptionsKey}`;

        return { ...item, id: newCartItemId, options: newOptions, price: newUnitPrice };
      });
    });
  }

  clearCart() {
    this.cartItems.set([]);
  }

  showNotification(message: string) {
    // Clear previous timeout if exists
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }

    this.notification.set({ message, visible: true });
    
    // Auto hide after 3 seconds
    this.notificationTimeout = setTimeout(() => {
      this.notification.set({ message: '', visible: false });
      this.notificationTimeout = null;
    }, 3000);
  }
}
