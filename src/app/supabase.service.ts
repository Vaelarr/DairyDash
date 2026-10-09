import { Injectable, computed, signal } from '@angular/core';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly client = createClient(environment.supabaseUrl, environment.supabaseKey);
  private readonly currentSession = signal<Session | null>(null);

  readonly user = computed<User | null>(() => this.currentSession()?.user ?? null);
  readonly isAdmin = computed(() => this.user()?.app_metadata?.['role'] === 'admin');
  readonly ready: Promise<void>;

  constructor() {
    // Keep the callback synchronous: awaiting Auth calls here can deadlock token refresh.
    this.client.auth.onAuthStateChange((_event, session) => this.currentSession.set(session));
    this.ready = this.client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      this.currentSession.set(data.session);
    });
    // A broken saved session must not prevent browsing the public catalog.
    void this.ready.catch(() => this.currentSession.set(null));
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    this.currentSession.set(data.session);
  }

  async signUp(email: string, password: string, name: string): Promise<boolean> {
    const { data, error } = await this.client.auth.signUp({
      email: email.trim(), password, options: { data: { display_name: name.trim() } },
    });
    if (error) throw error;
    this.currentSession.set(data.session);
    return data.session !== null;
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
