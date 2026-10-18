import { computed, Injectable, signal } from '@angular/core';

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
    this.items().reduce(
      (total, item) => total + item.quantity,
      0
    )
  );

  readonly total = computed(() =>
    this.items().reduce(
      (total, item) =>
        total + Math.round(item.price * 100) * item.quantity,
      0
    ) / 100
  );

  addProduct(
    product: CartProduct,
    quantity = 1,
    maximum = 99
  ): boolean {
    const valid = this.validProduct(product);
    const limit = this.quantityLimit(maximum);

    if (
      !valid ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return false;
    }

    const items = this.items();
    const existing = items.find(
      (item) => item.id === valid.id
    );

    const nextQuantity =
      (existing?.quantity ?? 0) + quantity;

    if (
      nextQuantity > limit ||
      (!existing && items.length >= 50)
    ) {
      return false;
    }

    const nextItem: CartItem = {
      ...valid,
      quantity: nextQuantity,
    };

    this.saveItems(
      existing
        ? items.map((item) =>
            item.id === valid.id ? nextItem : item
          )
        : [...items, nextItem]
    );

    return true;
  }

  increaseQuantity(
    productId: number | string,
    maximum = 99
  ): boolean {
    const id = this.productKey(productId);

    const item = this.items().find(
      (line) => line.id === id
    );

    if (
      !item ||
      item.quantity >= this.quantityLimit(maximum)
    ) {
      return false;
    }

    this.saveItems(
      this.items().map((line) =>
        line.id === id
          ? { ...line, quantity: line.quantity + 1 }
          : line
      )
    );

    return true;
  }

  decreaseQuantity(productId: number | string): void {
    const id = this.productKey(productId);

    this.saveItems(
      this.items()
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  removeProduct(productId: number | string): void {
    const id = this.productKey(productId);

    this.saveItems(
      this.items().filter((item) => item.id !== id)
    );
  }

  clearCart(): void {
    this.saveItems([]);
  }

  refreshProducts(products: CartProduct[]): void {
    const catalog = new Map<string, CartProduct>();

    for (const product of products) {
      const valid = this.validProduct(product);

      if (valid) {
        catalog.set(String(valid.id), valid);
      }
    }

    this.saveItems(
      this.items().map((item) => {
        const product = catalog.get(String(item.id));

        return product
          ? { ...product, quantity: item.quantity }
          : item;
      })
    );
  }

  completeCheckout(purchased: CartItem[]): void {
    const quantities = new Map<string, number>();

    for (const item of purchased) {
      const id = this.productKey(item.id);

      if (
        !id ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      ) {
        continue;
      }

      quantities.set(
        id,
        (quantities.get(id) ?? 0) + item.quantity
      );
    }

    // Preserve any extra items added while checkout was running.
    this.saveItems(
      this.items()
        .map((item) => ({
          ...item,
          quantity:
            item.quantity -
            (quantities.get(String(item.id)) ?? 0),
        }))
        .filter((item) => item.quantity > 0)
    );
  }

  private productKey(id: unknown): string {
    if (typeof id === 'string') {
      return id.trim();
    }

    return typeof id === 'number' &&
      Number.isSafeInteger(id)
      ? String(id)
      : '';
  }

  private quantityLimit(maximum: number): number {
    return Number.isFinite(maximum)
      ? Math.max(0, Math.min(99, Math.floor(maximum)))
      : 0;
  }

  private validProduct(value: unknown): CartProduct | null {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return null;
    }

    const product = value as Partial<CartProduct>;
    const id = this.productKey(product.id);

    if (
      !id ||
      typeof product.name !== 'string' ||
      !product.name.trim() ||
      typeof product.image !== 'string' ||
      typeof product.price !== 'number' ||
      !Number.isFinite(product.price) ||
      product.price < 0.01 ||
      product.price > 999999.99
    ) {
      return null;
    }

    return {
      id,
      name: product.name.trim(),
      image: product.image,
      price: Math.round(product.price * 100) / 100,
    };
  }

  private saveItems(items: CartItem[]): void {
    this.cartItems.set(items);

    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(items)
      );
    } catch {
      // Keep the cart usable in memory if storage is unavailable.
    }
  }

  private loadSavedCart(): CartItem[] {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '[]'
      );

      if (!Array.isArray(parsed)) {
        return [];
      }

      const saved = new Map<string, CartItem>();

      for (const entry of parsed) {
        const product = this.validProduct(entry);
        const quantity = entry?.quantity;

        if (
          !product ||
          typeof quantity !== 'number' ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 99
        ) {
          continue;
        }

        const id = String(product.id);
        const existing = saved.get(id);

        if (existing) {
          saved.set(id, {
            ...product,
            quantity: Math.min(
              99,
              existing.quantity + quantity
            ),
          });
        } else if (saved.size < 50) {
          saved.set(id, {
            ...product,
            quantity,
          });
        }
      }

      return [...saved.values()];
    } catch {
      return [];
    }
  }
}