import { Injectable, inject, signal, effect } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface UserPreferences {
  bottomNav: boolean;
  bottomNavExplicit?: boolean;
  darkMode: boolean;
}

const GLOBAL_STORAGE_KEY = 'dairyDash_user_preferences';
const USER_KEY_PREFIX = 'dairyDash_preferences_user_';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly auth = inject(SupabaseService);

  /**
   * Whether the bottom navigation bar is shown on mobile screens.
   * Defaults to false: hidden by default for both guest and signed-in users,
   * unless explicitly toggled on by the user.
   */
  readonly bottomNav = signal<boolean>(false);

  /**
   * Whether Dark Mode is enabled.
   * Defaults to false (warm cream light theme default).
   */
  readonly darkMode = signal<boolean>(false);

  private currentUserId: string | null = null;
  private bottomNavExplicitlyToggled = false;

  constructor() {
    this.loadGlobalPreferences();

    // Reactively synchronize the DOM classes with the dark mode signal
    effect(() => {
      const isDark = this.darkMode();
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('ion-palette-dark', isDark);
        document.documentElement.classList.toggle('dark', isDark);
        document.body.classList.toggle('ion-palette-dark', isDark);
        document.body.classList.toggle('dark', isDark);
      }
      this.savePreferences();
    });

    // Reactively handle user session changes (sign in / sign out / guest view)
    effect(() => {
      const user = this.auth.user();
      const userId = user?.id ?? null;
      if (userId !== this.currentUserId) {
        this.currentUserId = userId;
        this.handleUserChange(userId);
      }
    });
  }

  setBottomNav(enabled: boolean): void {
    this.bottomNavExplicitlyToggled = true;
    this.bottomNav.set(enabled);
    this.savePreferences();
  }

  setDarkMode(enabled: boolean): void {
    this.darkMode.set(enabled);
    this.savePreferences();
  }

  toggleBottomNav(): void {
    this.setBottomNav(!this.bottomNav());
  }

  toggleDarkMode(): void {
    this.setDarkMode(!this.darkMode());
  }

  private handleUserChange(userId: string | null): void {
    if (!userId) {
      // Guest view: bottom navbar is hidden by default and preferences are not shown
      this.bottomNavExplicitlyToggled = false;
      this.bottomNav.set(false);
      return;
    }

    // Signed in user: load their specific preferences
    try {
      if (typeof localStorage === 'undefined') return;
      const userKey = USER_KEY_PREFIX + userId;
      const stored = localStorage.getItem(userKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserPreferences>;
        // Bottom navbar is hidden by default unless explicitly toggled on
        if (parsed.bottomNavExplicit && typeof parsed.bottomNav === 'boolean') {
          this.bottomNavExplicitlyToggled = true;
          this.bottomNav.set(parsed.bottomNav);
        } else {
          this.bottomNavExplicitlyToggled = false;
          this.bottomNav.set(false);
        }
        if (typeof parsed.darkMode === 'boolean') {
          this.darkMode.set(parsed.darkMode);
        }
      } else {
        // New or first-time signed-in user: hidden by default
        this.bottomNavExplicitlyToggled = false;
        this.bottomNav.set(false);
      }
    } catch {
      this.bottomNav.set(false);
    }
  }

  private loadGlobalPreferences(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem(GLOBAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserPreferences>;
        // Dark mode can be preserved globally
        if (typeof parsed.darkMode === 'boolean') {
          this.darkMode.set(parsed.darkMode);
        }
      }
    } catch {
      // Keep defaults: bottomNav: false, darkMode: false
    }
  }

  private savePreferences(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const prefs: UserPreferences = {
        bottomNav: this.bottomNav(),
        bottomNavExplicit: this.bottomNavExplicitlyToggled,
        darkMode: this.darkMode(),
      };

      // Save global state (for dark mode)
      localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(prefs));

      // If user is signed in, save to their account-specific preferences
      if (this.currentUserId) {
        const userKey = USER_KEY_PREFIX + this.currentUserId;
        localStorage.setItem(userKey, JSON.stringify(prefs));
      }
    } catch {
      // Graceful fallback if localStorage is disabled or restricted
    }
  }
}
