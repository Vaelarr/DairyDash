import { Injectable, signal, effect } from '@angular/core';

export interface UserPreferences {
  bottomNav: boolean;
  darkMode: boolean;
}

const STORAGE_KEY = 'dairyDash_user_preferences';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  /**
   * Whether the bottom navigation bar is shown on mobile screens.
   * Defaults to true so users have quick navigation out of the box.
   */
  readonly bottomNav = signal<boolean>(true);

  /**
   * Whether Dark Mode is enabled.
   * Defaults to false (warm cream light theme default).
   */
  readonly darkMode = signal<boolean>(false);

  constructor() {
    this.loadPreferences();

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

    // Reactively save bottom navigation preference
    effect(() => {
      // Access signal to register dependency
      this.bottomNav();
      this.savePreferences();
    });
  }

  setBottomNav(enabled: boolean): void {
    this.bottomNav.set(enabled);
  }

  setDarkMode(enabled: boolean): void {
    this.darkMode.set(enabled);
  }

  toggleBottomNav(): void {
    this.bottomNav.update((v) => !v);
  }

  toggleDarkMode(): void {
    this.darkMode.update((v) => !v);
  }

  private loadPreferences(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserPreferences>;
        if (typeof parsed.bottomNav === 'boolean') {
          this.bottomNav.set(parsed.bottomNav);
        }
        if (typeof parsed.darkMode === 'boolean') {
          this.darkMode.set(parsed.darkMode);
        }
      }
    } catch {
      // Keep defaults: bottomNav: true, darkMode: false
    }
  }

  private savePreferences(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          bottomNav: this.bottomNav(),
          darkMode: this.darkMode(),
        })
      );
    } catch {
      // Graceful fallback if localStorage is disabled or restricted
    }
  }
}
