import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { Product } from '../models/product';
import { ProductReview, ReviewInput } from '../models/product-review';

export { PRODUCT_CATEGORIES } from '../data/product-categories';

export interface ProductInput {
  name: string;
  category: string;
  price: number;
  stock?: number;
  description: string;
  photo?: string;
}

interface ApiProduct extends Omit<Product, 'price'> {
  price: number;
}

interface ApiResponse<T> {
  data: T;
}

export function priceValue(product: Product): number {
  return parseFloat(product.price.replace(/[^\d.]/g, '')) || 0;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    const message = error.error?.error?.message;
    if (typeof message === 'string') return message;
  }
  return 'The request could not be completed. Please try again.';
}

function toProduct(product: ApiProduct): Product {
  return {
    ...product,
    price: `₱${product.price.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl.replace(/\/$/, '');
  private readonly items = signal<Product[]>([]);
  private refreshRequest: Promise<boolean> | null = null;
  private revision = 0;
  private readonly productRevisions = new Map<string, number>();

  readonly products = this.items.asReadonly();
  readonly featured = computed(() => this.items().filter((product) => product.id.startsWith('seed-')).slice(0, 9));
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.refresh();
  }

  getById(id: string): Product | undefined {
    return this.items().find((product) => product.id === id);
  }

  /** Share an in-flight catalog request between Ionic pages. */
  refresh(): Promise<boolean> {
    if (this.refreshRequest) return this.refreshRequest;
    this.loading.set(true);
    this.error.set('');
    const revision = this.revision;
    this.refreshRequest = firstValueFrom(
      this.http.get<ApiResponse<ApiProduct[]>>(`${this.baseUrl}/products`).pipe(timeout(15000))
    ).then((response) => {
      // A slow catalog response must not undo a subsequently confirmed save or deletion.
      if (revision === this.revision) this.items.set(response.data.map(toProduct));
      return true;
    }).catch((error: unknown) => {
      this.error.set(apiErrorMessage(error));
      return false;
    }).finally(() => {
      this.loading.set(false);
      this.refreshRequest = null;
    });
    return this.refreshRequest;
  }

  async fetchById(id: string): Promise<Product | undefined> {
    const revision = this.productRevisions.get(id) ?? 0;
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<ApiProduct>>(`${this.baseUrl}/products/${encodeURIComponent(id)}`).pipe(timeout(15000))
      );
      if (revision !== (this.productRevisions.get(id) ?? 0)) return this.getById(id);
      const product = toProduct(response.data);
      this.putInCatalog(product);
      return product;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        if (revision !== (this.productRevisions.get(id) ?? 0)) return this.getById(id);
        this.recordMutation(id);
        this.items.update((items) => items.filter((product) => product.id !== id));
        return undefined;
      }
      throw error;
    }
  }

  async add(input: ProductInput): Promise<Product> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<ApiProduct>>(`${this.baseUrl}/products`, input).pipe(timeout(15000))
    );
    const product = toProduct(response.data);
    this.recordMutation(product.id);
    this.items.update((items) => [product, ...items]);
    return product;
  }

  async update(id: string, input: ProductInput): Promise<Product> {
    const response = await firstValueFrom(
      this.http.put<ApiResponse<ApiProduct>>(`${this.baseUrl}/products/${encodeURIComponent(id)}`, input).pipe(timeout(15000))
    );
    const product = toProduct(response.data);
    this.recordMutation(id);
    this.putInCatalog(product);
    return product;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/products/${encodeURIComponent(id)}`).pipe(timeout(15000)));
    this.recordMutation(id);
    this.items.update((items) => items.filter((product) => product.id !== id));
  }

  async getReviews(id: string): Promise<ProductReview[]> {
    const response = await firstValueFrom(
      this.http.get<ApiResponse<ProductReview[]>>(`${this.baseUrl}/products/${encodeURIComponent(id)}/reviews`).pipe(timeout(15000))
    );
    return response.data;
  }

  async addReview(id: string, input: ReviewInput): Promise<ProductReview> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<ProductReview>>(`${this.baseUrl}/products/${encodeURIComponent(id)}/reviews`, input).pipe(timeout(15000))
    );
    return response.data;
  }

  private putInCatalog(product: Product) {
    this.items.update((items) => items.some((item) => item.id === product.id)
      ? items.map((item) => item.id === product.id ? product : item)
      : [...items, product]);
  }

  private recordMutation(id: string) {
    this.revision++;
    this.productRevisions.set(id, (this.productRevisions.get(id) ?? 0) + 1);
  }
}
