import { Injectable, computed, signal } from '@angular/core';
import { Product } from '../models/product';
import { SEED_PRODUCTS } from '../data/seed-products';

export const PRODUCT_CATEGORIES = [
  'Fresh Milk',
  'Flavored Milk',
  'Plant-Based Milk',
  'Yogurt',
  'Cheese',
  'Butter & Cream',
  'Other',
];

export interface ProductInput {
  name: string;
  category: string;
  price: number;
  stock?: number;
  description: string;
  photo?: string;
}

const CUSTOM_KEY = 'milkswift.custom-products';
const OVERRIDES_KEY = 'milkswift.product-overrides';
const DELETED_KEY = 'milkswift.deleted-products';
const FEATURED_COUNT = 9;

/** "₱1,234.50" -> 1234.5 */
export function priceValue(product: Product): number {
  return parseFloat(product.price.replace(/[^\d.]/g, '')) || 0;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  /** Products added in the app. */
  private readonly custom = signal<Product[]>(this.loadCustom());
  /** Edits to built-in products, keyed by product id (the catalog itself lives in code). */
  private readonly overrides = signal<Record<string, Product>>(this.loadOverrides());

  /** Ids of built-in products the user deleted (they live in code, so they can only be hidden). */
  private readonly deleted = signal<string[]>(this.loadDeleted());

  private readonly catalog = computed(() =>
    SEED_PRODUCTS.filter((p) => !this.deleted().includes(p.id)).map(
      (p) => this.overrides()[p.id] ?? p
    )
  );

  /** Products added in the app (newest first), followed by the built-in catalog. */
  readonly products = computed(() => [...this.custom(), ...this.catalog()]);

  /** The built-in products shown on the dashboard, with any edits applied. */
  readonly featured = computed(() => this.catalog().slice(0, FEATURED_COUNT));

  getById(id: string): Product | undefined {
    return this.products().find((p) => p.id === id);
  }

  /** Returns false when the product couldn't be saved (e.g. browser storage is full). */
  add(input: ProductInput): boolean {
    const next = [this.build(newId(), input), ...this.custom()];
    if (!save(CUSTOM_KEY, next)) return false;
    this.custom.set(next);
    return true;
  }

  /** Returns false when the product doesn't exist or couldn't be saved. */
  update(id: string, input: ProductInput): boolean {
    if (!this.getById(id)) return false;
    const updated = this.build(id, input);

    if (this.custom().some((p) => p.id === id)) {
      const next = this.custom().map((p) => (p.id === id ? updated : p));
      if (!save(CUSTOM_KEY, next)) return false;
      this.custom.set(next);
    } else {
      const next = { ...this.overrides(), [id]: updated };
      if (!save(OVERRIDES_KEY, next)) return false;
      this.overrides.set(next);
    }
    return true;
  }

  /** Returns false when the product doesn't exist or the change couldn't be saved. */
  remove(id: string): boolean {
    if (!this.getById(id)) return false;

    if (this.custom().some((p) => p.id === id)) {
      const next = this.custom().filter((p) => p.id !== id);
      if (!save(CUSTOM_KEY, next)) return false;
      this.custom.set(next);
    } else {
      const next = [...this.deleted(), id];
      if (!save(DELETED_KEY, next)) return false;
      this.deleted.set(next);
    }
    return true;
  }

  private build(id: string, input: ProductInput): Product {
    return {
      id,
      name: input.name.trim(),
      price: `₱${input.price.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      description: input.description.trim(),
      ...(input.category ? { category: input.category } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.photo ? { photo: input.photo } : {}),
    };
  }

  private loadCustom(): Product[] {
    const stored = read<Partial<Product>[]>(CUSTOM_KEY, []);
    if (!Array.isArray(stored)) return [];

    const valid = stored.filter((p): p is Product => typeof p?.name === 'string');
    // Products saved before ids existed get one now.
    const withIds = valid.map((p) => (p.id ? p : { ...p, id: newId() }));
    if (withIds.some((p, i) => p !== valid[i])) save(CUSTOM_KEY, withIds);
    return withIds;
  }

  private loadDeleted(): string[] {
    const stored = read<unknown>(DELETED_KEY, []);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  }

  private loadOverrides(): Record<string, Product> {
    const stored = read<Record<string, Product>>(OVERRIDES_KEY, {});
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  }
}

// Not crypto.randomUUID(): it only exists on secure origins, and the dev server is often opened
// over plain http from a phone on the local network.
function newId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
