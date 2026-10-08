import { inject } from '@angular/core';
import { type HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../supabase.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const base = environment.apiUrl.replace(/\/$/, '');
  if (request.url !== base && !request.url.startsWith(`${base}/`)) return next(request);
  return from(inject(SupabaseService).accessToken()).pipe(switchMap((token) => next(
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request
  )));
};
