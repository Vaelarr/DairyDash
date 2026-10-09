import { Injectable, computed, signal } from '@angular/core';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { AccountValidationError, emailError, normalizeEmail, passwordError } from './services/account-validation';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client = createClient(environment.supabaseUrl, environment.supabaseKey);
  private readonly currentSession = signal<Session | null>(null);

  readonly user = computed<User | null>(() => this.currentSession()?.user ?? null);
  readonly isAdmin = computed(() => this.user()?.app_metadata?.['role'] === 'admin');
  readonly ready: Promise<void>;
  readonly recoveringPassword = signal(false);
  readonly callbackError = signal<unknown>(null);
  readonly initializing = signal(true);

  constructor() {
    // Keep the callback synchronous: awaiting Auth calls here can deadlock token refresh.
    this.client.auth.onAuthStateChange((event, session) => {
      this.currentSession.set(session);
      if (event === 'PASSWORD_RECOVERY') this.recoveringPassword.set(true);
      if (event === 'SIGNED_OUT') this.recoveringPassword.set(false);
    });
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const { error: callbackError } = await this.client.auth.initialize();
      if (callbackError) this.callbackError.set(callbackError);
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.currentSession.set(data.session);
      if (data.session && !callbackError && new URL(window.location.href).searchParams.get('action') === 'reset') {
        this.recoveringPassword.set(true);
      }
    } catch (error) {
      this.callbackError.set(error);
      this.currentSession.set(null);
    } finally {
      // The SDK consumes successful callback tokens; also remove failed-link diagnostics.
      const url = new URL(window.location.href);
      for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
      const hash = new URLSearchParams(url.hash.slice(1));
      if (['access_token', 'refresh_token', 'error', 'error_code', 'error_description'].some((key) => hash.has(key))) url.hash = '';
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
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
    const origin = environment.apiUrl.startsWith('https://') ? new URL(environment.apiUrl).origin : window.location.origin;
    return `${origin}/account${recovery ? '?action=reset' : ''}`;
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.ready;
    if (!password) throw new AccountValidationError({ password: 'Enter your password.' });
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
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.currentSession.set(null);
  }

  async accessToken(): Promise<string | null> {
    await this.ready.catch(() => undefined);
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session?.access_token ?? null;
  }
}
