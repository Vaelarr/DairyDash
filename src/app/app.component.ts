import {
  Component,
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
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

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
  readonly showSplash = signal(true);

  private splashTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const auth = inject(SupabaseService);
    const router = inject(Router);
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
