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
      (total, item) => total + item.price * item.quantity,
      0
    )
  );

  constructor() {
    effect(() => {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.cartItems())
      );
    });
  }

  addProduct(product: CartProduct): void {
    this.cartItems.update((items) => {
      const existingItem = items.find(
        (item) => item.id === product.id
      );

      if (existingItem) {
        return items.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...items,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  }

  increaseQuantity(productId: number | string): void {
    this.cartItems.update((items) =>
      items.map((item) =>
        item.id === productId
          ? { ...item, quantity: item.quantity + 1 }
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

  private loadSavedCart(): CartItem[] {
    try {
      const savedCart = localStorage.getItem(this.storageKey);
      return savedCart ? JSON.parse(savedCart) : [];
    } catch {
      return [];
    }
  }
}