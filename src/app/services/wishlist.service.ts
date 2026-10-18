import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { WishlistItem } from '../models/wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl.replace(/\/$/, '')}/wishlist`;

  async list(): Promise<WishlistItem[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: WishlistItem[] }>(this.url).pipe(timeout(15000))
    );
    return response.data;
  }

  async save(productId: string): Promise<WishlistItem> {
    const response = await firstValueFrom(
      this.http.put<{ data: WishlistItem }>(`${this.url}/${encodeURIComponent(productId)}`, {}).pipe(timeout(15000))
    );
    return response.data;
  }

  async remove(productId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.url}/${encodeURIComponent(productId)}`).pipe(timeout(15000)));
  }
}
