import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { Order, OrderCustomer } from '../models/order';
import { SupabaseService } from '../supabase.service';
import { CartItem } from './cart.service';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(SupabaseService);
  private readonly base = environment.apiUrl.replace(/\/$/, '');
  private pending: { fingerprint: string; requestId: string } | null = null;

  async place(customer: OrderCustomer, cart: CartItem[]): Promise<Order> {
    await this.auth.ready.catch(() => undefined);
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Sign in to place an order.');
    const body = {
      customer: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone.trim(), address: customer.address.trim() },
      items: cart.map((item) => ({ productId: String(item.id), quantity: item.quantity, price: item.price }))
        .sort((a, b) => a.productId.localeCompare(b.productId)),
    };
    const fingerprint = JSON.stringify({ userId, ...body });
    const key = `dairyDashCheckout:${userId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved?.fingerprint === fingerprint && typeof saved?.requestId === 'string') this.pending = saved;
    } catch { /* Keep an in-memory retry key when storage is unavailable. */ }
    if (this.pending?.fingerprint !== fingerprint) {
      // getRandomValues also works during HTTP LAN development, unlike randomUUID.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      this.pending = { fingerprint, requestId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
    }
    const pending = this.pending;
    try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* In-memory retries still work. */ }
    let response: { data: Order };
    try {
      response = await firstValueFrom(this.http.post<{ data: Order }>(`${this.base}/orders`, {
        ...body, requestId: pending.requestId,
      }).pipe(timeout(20000)));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.error?.code === 'CHECKOUT_DELETED') {
        this.pending = null;
        try { localStorage.removeItem(key); } catch { /* Retire the deleted checkout key in memory. */ }
      }
      throw error;
    }
    this.pending = null;
    try { localStorage.removeItem(key); } catch { /* The order has already been saved. */ }
    if (response.data.status === 'cancelled') {
      // A previously committed checkout may have been cancelled while its response was lost.
      throw new HttpErrorResponse({ status: 409, error: { error: {
        message: 'This checkout was cancelled. Review your cart and place a new order.',
      } } });
    }
    return response.data;
  }

  async list(admin = false): Promise<Order[]> {
    const response = await firstValueFrom(this.http.get<{ data: Order[] }>(this.ordersUrl(admin)).pipe(timeout(20000)));
    return response.data;
  }

  async update(order: Order, change: { customer?: OrderCustomer; status?: Order['status'] }, admin = false): Promise<Order> {
    const response = await firstValueFrom(this.http.put<{ data: Order }>(`${this.ordersUrl(admin)}/${order.id}`,
      { ...change, updatedAt: order.updatedAt }).pipe(timeout(20000)));
    return response.data;
  }

  async remove(order: Order, admin = false): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.ordersUrl(admin)}/${order.id}`,
      { headers: { 'If-Match': `"${order.updatedAt}"` } }).pipe(timeout(20000)));
  }

  private ordersUrl(admin: boolean): string { return `${this.base}/${admin ? 'admin/' : ''}orders`; }
}
