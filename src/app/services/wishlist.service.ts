import { Injectable, signal } from '@angular/core';
import { Product } from '../models/product';

@Injectable({
  providedIn: 'root',
})
export class WishlistService {
  private readonly storageKey = 'dairyDashWishlist';
  private readonly savedProducts = signal<Product[]>(
    this.loadSavedProducts()
  );

  readonly items = this.savedProducts.asReadonly();

  hasProduct(productId: string): boolean {
    return this.items().some((product) => product.id === productId);
  }

  addProduct(value: Product): boolean {
    const product = this.validProduct(value);

    if (!product) {
      return false;
    }

    const existing = this.items();
    const index = existing.findIndex((item) => item.id === product.id);

    if (index >= 0) {
      this.saveItems(
        existing.map((item) => item.id === product.id ? product : item)
      );
      return true;
    }

    if (existing.length >= 50) {
      return false;
    }

    this.saveItems([...existing, product]);
    return true;
  }

  removeProduct(productId: string): void {
    this.saveItems(
      this.items().filter((product) => product.id !== productId)
    );
  }

  refreshProducts(products: Product[]): void {
    const catalog = new Map(
      products.map((product) => [product.id, product])
    );

    this.saveItems(
      this.items().map((item) => catalog.get(item.id) ?? item)
    );
  }

  private validProduct(value: unknown): Product | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const product = value as Partial<Product>;

    if (
      typeof product.id !== 'string' ||
      !product.id.trim() ||
      typeof product.name !== 'string' ||
      !product.name.trim() ||
      typeof product.price !== 'string' ||
      !product.price.trim() ||
      typeof product.description !== 'string'
    ) {
      return null;
    }

    return {
      id: product.id.trim(),
      name: product.name.trim(),
      price: product.price.trim(),
      description: product.description,
      ...(typeof product.photo === 'string' ? { photo: product.photo } : {}),
      ...(typeof product.category === 'string' ? { category: product.category } : {}),
      ...(typeof product.stock === 'number' && Number.isFinite(product.stock)
        ? { stock: product.stock }
        : {}),
    };
  }

  private saveItems(items: Product[]): void {
    this.savedProducts.set(items);

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Keep the wishlist usable in memory if storage is unavailable.
    }
  }

  private loadSavedProducts(): Product[] {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(this.storageKey) ?? '[]'
      );

      if (!Array.isArray(parsed)) {
        return [];
      }

      const saved = new Map<string, Product>();

      for (const entry of parsed) {
        const product = this.validProduct(entry);

        if (product && !saved.has(product.id) && saved.size < 50) {
          saved.set(product.id, product);
        }
      }

      return [...saved.values()];
    } catch {
      return [];
    }
  }
}
