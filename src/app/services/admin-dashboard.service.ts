import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { AdminDashboard } from '../models/admin-dashboard';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl.replace(/\/$/, '')}/admin/dashboard`;

  async load(): Promise<AdminDashboard> {
    const response = await firstValueFrom(
      this.http.get<{ data: AdminDashboard }>(this.url).pipe(timeout(20000))
    );
    return response.data;
  }
}
