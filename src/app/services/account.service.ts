import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { Account } from '../models/account';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);

  async get(): Promise<Account> {
    const response = await firstValueFrom(this.http.get<{ data: Account }>(
      `${environment.apiUrl.replace(/\/$/, '')}/account`,
    ).pipe(timeout(15000)));
    return response.data;
  }
}
