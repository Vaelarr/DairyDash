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
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(SupabaseService);
  private readonly currentPath = signal(window.location.pathname);
  readonly confirmationView = computed(() => this.currentPath() === '/account' &&
    this.auth.emailConfirmation() !== 'none' && !this.auth.recoveringPassword());
  readonly showSplash = signal(true);

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

  ngOnInit(): void {
    this.splashTimer = setTimeout(() => {
      this.showSplash.set(false);
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.splashTimer !== undefined) {
      clearTimeout(this.splashTimer);
    }
  }
}
