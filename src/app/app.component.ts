import {
  Component,
  computed,
  signal,
  effect,
  inject,
  type OnInit,
  type OnDestroy,
} from '@angular/core';

import {
  IonApp,
  IonSplitPane,
  IonRouterOutlet,
} from '@ionic/angular';

import { MenuComponent } from './components/menu/menu.component';
import { SplashScreenComponent } from './components/splash-screen/splash-screen.component';
import { AdminTabBarComponent } from './components/admin-tab-bar/admin-tab-bar.component';
import { ShoppingTabBarComponent } from './components/shopping-tab-bar/shopping-tab-bar.component';
import { isAdminTabRoute, isPreviewAdminRoute } from './components/admin-tab-bar/admin-tab-bar.config';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { cleanAuthCallbackPath } from './services/account-validation';

import { addIcons } from 'ionicons';
import {
  gridOutline,
  cubeOutline,
  cartOutline,
  informationCircleOutline,
  peopleOutline,
  timeOutline,
  medicalOutline,
  leafOutline,
  ribbonOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.css'],
  standalone: true,
  imports: [
    IonApp,
    IonSplitPane,
    IonRouterOutlet,
    MenuComponent,
    SplashScreenComponent,
    AdminTabBarComponent,
    ShoppingTabBarComponent,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(SupabaseService);
  readonly currentPath = signal(window.location.pathname);
  readonly confirmationView = computed(() => this.currentPath() === '/account' &&
    this.auth.emailConfirmation() !== 'none' && !this.auth.recoveringPassword());
  // The bottom tab bar is a shortcut between the admin pages; it's shown alongside the sidebar,
  // not instead of it, so admins never lose access to the rest of the site from "admin mode".
  // It also shows on the unguarded "-preview" routes, for anyone (no sign-in needed), so the
  // tab bar itself can be reviewed and used to hop between the preview pages.
  readonly adminTabsView = computed(() => {
    const path = this.currentPath();
    return isAdminTabRoute(path) && (this.auth.isAdmin() || isPreviewAdminRoute(path));
  });
  readonly shoppingTabsView = computed(() => !this.confirmationView() && !this.adminTabsView() &&
    !/^\/(checkout|manage-|add-product|edit-product|admin-)/.test(this.currentPath()));
  readonly showSplash = signal(this.needsSplash());

  private needsSplash(): boolean {
    try { return sessionStorage.getItem('dairyDashSplashSeen') !== '1'; }
    catch { return true; }
  }

  private splashTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const auth = this.auth;
    const router = inject(Router);
    // Initial navigation can restore a fragment captured before Auth consumed it.
    // Clean the router's URL too, so tokens and failed-link diagnostics stay removed.
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(),
    ).subscribe((event) => {
      this.currentPath.set(event.urlAfterRedirects.split(/[?#]/)[0]);
      // Let Auth read the callback before changing the URL, including on a slow connection.
      void auth.ready.then(() => {
        const cleanPath = cleanAuthCallbackPath(router.url);
        if (cleanPath !== router.url) void router.navigateByUrl(cleanPath, { replaceUrl: true });
      });
    });
    effect(() => {
      if (auth.recoveringPassword()) {
        void router.navigate(['/account'], { queryParams: { action: 'reset' }, replaceUrl: true });
      }
    });
    // A global body class lets the global stylesheet keep page content clear of the fixed bar,
    // without every page needing to know the tab bar exists.
    effect(() => {
      document.body.classList.toggle('has-admin-tabs', this.adminTabsView());
      document.body.classList.toggle('has-shopping-tabs', this.shoppingTabsView());
    });
    addIcons({
      gridOutline,
      cubeOutline,
      cartOutline,
      informationCircleOutline,
      peopleOutline,
      timeOutline,
      medicalOutline,
      leafOutline,
      ribbonOutline,
      'grid-outline': gridOutline,
      'cube-outline': cubeOutline,
      'cart-outline': cartOutline,
      'information-circle-outline': informationCircleOutline,
      'people-outline': peopleOutline,
      'time-outline': timeOutline,
      'medical-outline': medicalOutline,
      'leaf-outline': leafOutline,
      'ribbon-outline': ribbonOutline,
    });
  }

  onSplashDismissed(): void {
    try { sessionStorage.setItem('dairyDashSplashSeen', '1'); } catch { /* The app stays usable without session storage. */ }
    if (this.splashTimer !== undefined) {
      clearTimeout(this.splashTimer);
      this.splashTimer = undefined;
    }
    this.showSplash.set(false);
  }

  focusContent(event: Event): void {
    event.preventDefault();
    const content = [...document.querySelectorAll<HTMLElement>('ion-router-outlet main, ion-router-outlet .cart-container')]
      .find((element) => !element.closest('.ion-page-hidden') && element.getBoundingClientRect().width > 0);
    if (content) {
      if (!content.hasAttribute('tabindex')) content.setAttribute('tabindex', '-1');
      content.focus();
    }
  }

  ngOnInit(): void {
    if (!this.showSplash()) return;
    // Fallback safety timer in case dismiss event is blocked
    this.splashTimer = setTimeout(() => {
      this.onSplashDismissed();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.splashTimer !== undefined) {
      clearTimeout(this.splashTimer);
    }
  }
}
