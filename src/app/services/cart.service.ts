import {
  computed,
  effect,
  Injectable,
  signal,
} from '@angular/core';

export interface CartProduct {
  id: number | string;
  name: string;
  price: number;
  image: string;
}

export interface CartItem extends CartProduct {
  quantity: number;
}

@Injectable({
  providedIn: 'root',
})
export class CartService {
  private readonly storageKey = 'dairyDashCart';

  private readonly cartItems = signal<CartItem[]>(
    this.loadSavedCart()
  );

  readonly items = this.cartItems.asReadonly();

  readonly itemCount = computed(() =>
    this.cartItems().reduce(
      (total, item) => total + item.quantity,
      0
    )
  );

  readonly total = computed(() =>
    this.cartItems().reduce(
      (total, item) => total + Math.round(item.price * 100) * item.quantity,
      0
    ) / 100
  );

  constructor() {
    effect(() => {
      try { localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.cartItems())
      ); } catch { /* The cart remains usable when browser storage is unavailable. */ }
    });
  }

  addProduct(product: CartProduct, quantity = 1): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;
    this.cartItems.update((items) => {
      const existingItem = items.find(
        (item) => item.id === product.id
      );

      if (existingItem) {
        return items.map((item) =>
          item.id === product.id
            ? { ...product, quantity: Math.min(99, item.quantity + quantity) }
            : item
        );
      }

      if (items.length >= 50) return items;
      return [
        ...items,
        {
          ...product,
          quantity,
        },
      ];
    });
  }

  increaseQuantity(productId: number | string): void {
    this.cartItems.update((items) =>
      items.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.min(99, item.quantity + 1) }
          : item
      )
    );
  }

  decreaseQuantity(productId: number | string): void {
    this.cartItems.update((items) =>
      items
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  removeProduct(productId: number | string): void {
    this.cartItems.update((items) =>
      items.filter((item) => item.id !== productId)
    );
  }

  clearCart(): void {
    this.cartItems.set([]);
  }

  refreshProducts(products: CartProduct[]): void {
    this.cartItems.update((items) => items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.id);
      return product ? { ...item, ...product } : item;
    }));
  }

  completeCheckout(purchased: CartItem[]): void {
    this.cartItems.update((items) => items.map((item) => ({
      ...item, quantity: Math.max(0, item.quantity - (purchased.find((line) => line.id === item.id)?.quantity ?? 0)),
    })).filter((item) => item.quantity > 0));
  }

  private loadSavedCart(): CartItem[] {
    try {
      const savedCart = localStorage.getItem(this.storageKey);
      const parsed: unknown = savedCart ? JSON.parse(savedCart) : [];
      if (!Array.isArray(parsed)) return [];
      const ids = new Set<string>();
      return parsed.filter((item) => {
        if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' ||
            typeof item.image !== 'string' || typeof item.price !== 'number' || !Number.isFinite(item.price) ||
            item.price < 0.01 || item.price > 999999.99 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return false;
        ids.add(item.id);
        return true;
      }).slice(0, 50);
    } catch {
      return [];
    }
  }
}
