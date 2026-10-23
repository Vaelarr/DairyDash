import { Injectable, computed, signal } from '@angular/core';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { environment } from '../environments/environment';
import { AccountValidationError, cleanAuthCallbackPath, emailError, isEmailConfirmationCallback, normalizeEmail, passwordError } from './services/account-validation';

export const ADMIN_EMAIL = 'admin@dairydash.com';
export const ADMIN_PASSWORD = 'admin12345678';
export const ADMIN_DEMO_TOKEN = 'dairydash-admin-token';

export const ADMIN_USER: User = {
  id: '00000000-0000-0000-0000-000000000001',
  app_metadata: { role: 'admin', provider: 'email', providers: ['email'] },
  user_metadata: { display_name: 'DairyDash Admin' },
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
  email: ADMIN_EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  role: 'authenticated',
  updated_at: '2026-01-01T00:00:00.000Z',
} as User;

export const ADMIN_SESSION: Session = {
  access_token: ADMIN_DEMO_TOKEN,
  token_type: 'bearer',
  expires_in: 315360000,
  expires_at: 2147483647,
  refresh_token: 'dairydash-admin-refresh-token',
  user: ADMIN_USER,
};

const ADMIN_STORAGE_KEY = 'dairydash_admin_session';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  // Capture callback intent before the SDK consumes and removes the URL fragment.
  private readonly initialCallbackUrl = window.location.href;
  private readonly confirmingEmail = isEmailConfirmationCallback(this.initialCallbackUrl);
  private readonly client = createClient(environment.supabaseUrl, environment.supabaseKey);
  private readonly currentSession = signal<Session | null>(null);

  readonly user = computed<User | null>(() => this.currentSession()?.user ?? null);
  readonly isAdmin = computed(() => this.user()?.app_metadata?.['role'] === 'admin');
  readonly ready: Promise<void>;
  readonly recoveringPassword = signal(false);
  readonly callbackError = signal<unknown>(null);
  readonly initializing = signal(true);
  readonly emailConfirmation = signal<'none' | 'verifying' | 'confirmed' | 'failed'>(this.confirmingEmail ? 'verifying' : 'none');

  constructor() {
    // Keep the callback synchronous: awaiting Auth calls here can deadlock token refresh.
    this.client.auth.onAuthStateChange((event, session) => {
      if (this.currentSession()?.access_token === ADMIN_DEMO_TOKEN && !session) return;
      this.currentSession.set(session);
      if (event === 'PASSWORD_RECOVERY') this.recoveringPassword.set(true);
      if (event === 'SIGNED_OUT') this.recoveringPassword.set(false);
    });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(ADMIN_STORAGE_KEY) === 'true') {
        this.currentSession.set(ADMIN_SESSION);
        this.initializing.set(false);
        return;
      }
      const { error: callbackError } = await this.client.auth.initialize();
      if (callbackError) this.callbackError.set(callbackError);
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.currentSession.set(data.session);
      if (data.session && !callbackError && new URL(window.location.href).searchParams.get('action') === 'reset') {
        this.recoveringPassword.set(true);
      }
      if (this.confirmingEmail) {
        if (callbackError || !data.session) {
          this.emailConfirmation.set('failed');
        } else {
          // Verify the callback's account with Auth before displaying a success message.
          const { data: verified, error: verificationError } = await this.client.auth.getUser(data.session.access_token);
          if (verificationError) throw verificationError;
          if (!verified.user?.email || !verified.user.email_confirmed_at || verified.user.id !== data.session.user.id) {
            throw { code: 'email_not_confirmed' };
          }
          this.currentSession.set({ ...data.session, user: verified.user });
          this.emailConfirmation.set('confirmed');
        }
      }
    } catch (error) {
      this.callbackError.set(error);
      this.currentSession.set(null);
      if (this.confirmingEmail) this.emailConfirmation.set('failed');
    } finally {
      // The SDK consumes successful callback tokens; also remove failed-link diagnostics.
      window.history.replaceState(window.history.state, '', cleanAuthCallbackPath(window.location.href));
      this.initializing.set(false);
    }
  }

  private checkedEmail(email: string): string {
    const error = emailError(email);
    if (error) throw new AccountValidationError({ email: error });
    return normalizeEmail(email);
  }

  private redirectUrl(recovery = false): string {
    // Native email links open the deployed website; users can then sign in in the app.
    const origin = Capacitor.isNativePlatform() ? new URL(environment.apiUrl).origin : window.location.origin;
    return `${origin}/account${recovery ? '?action=reset' : ''}`;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.ready;
    if (!password) throw new AccountValidationError({ password: 'Enter your password.' });
    const normalized = normalizeEmail(email);
    if (normalized === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      }
      this.currentSession.set(ADMIN_SESSION);
      return;
    }
    const { data, error } = await this.client.auth.signInWithPassword({ email: this.checkedEmail(email), password });
    if (error) throw error;
    this.currentSession.set(data.session);
  }

  async signUp(email: string, password: string, name: string): Promise<boolean> {
    await this.ready;
    const fields = {
      ...(passwordError(password) ? { password: passwordError(password) } : {}),
      ...(!name.trim() || name.trim().length > 80 ? { name: 'Enter your name using 1 to 80 characters.' } : {}),
    };
    if (Object.keys(fields).length) throw new AccountValidationError(fields);
    const { data, error } = await this.client.auth.signUp({
      email: this.checkedEmail(email), password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: this.redirectUrl() },
    });
    if (error) throw error;
    this.currentSession.set(data.session);
    return data.session !== null;
  }

  async resendConfirmation(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resend({
      type: 'signup', email: this.checkedEmail(email), options: { emailRedirectTo: this.redirectUrl() },
    });
    if (error) throw error;
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.ready;
    const { error } = await this.client.auth.resetPasswordForEmail(this.checkedEmail(email), { redirectTo: this.redirectUrl(true) });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    await this.ready;
    const errorMessage = passwordError(password);
    if (errorMessage) throw new AccountValidationError({ password: errorMessage });
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    const session = this.currentSession();
    if (session) this.currentSession.set({ ...session, user: data.user });
    this.recoveringPassword.set(false);
  }

  async signOut(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
    if (this.currentSession()?.access_token === ADMIN_DEMO_TOKEN) {
      this.currentSession.set(null);
      return;
    }
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.currentSession.set(null);
  }

  async accessToken(): Promise<string | null> {
    await this.ready.catch(() => undefined);
    if (this.currentSession()?.access_token === ADMIN_DEMO_TOKEN) {
      return ADMIN_DEMO_TOKEN;
    }
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  }
}
