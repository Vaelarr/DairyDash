import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SupabaseService } from '../supabase.service';

export const accountGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(SupabaseService);
  const router = inject(Router);
  await auth.ready.catch(() => undefined);
  return auth.user() !== null || router.createUrlTree(['/account'], { queryParams: { returnUrl: state.url } });
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(SupabaseService);
  const router = inject(Router);
  await auth.ready.catch(() => undefined);
  if (!auth.user()) return router.createUrlTree(['/account'], { queryParams: { returnUrl: state.url } });
  return auth.isAdmin() || router.createUrlTree(['/account'], { queryParams: { adminRequired: 'true' } });
};
