import { Component, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../supabase.service';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonMenu,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonIcon,
  IonLabel,
  IonNote,
  IonMenuToggle,
  IonRouterLink,
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  cubeOutline,
  gridOutline,
  cartOutline,
  informationCircleOutline,
  peopleOutline,
  settingsOutline,
  timeOutline,
  personOutline,
  callOutline,
} from 'ionicons/icons';

interface AppPage {
  title: string;
  url: string;
  icon: string;
}

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css'],
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonMenu,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonIcon,
    IonLabel,
    IonNote,
    IonMenuToggle,
    IonRouterLink,
  ],
})
export class MenuComponent {
  readonly auth = inject(SupabaseService);
  readonly user = computed(() => ({
    name: this.auth.user()?.user_metadata?.['display_name'] || this.auth.user()?.email || 'Guest',
    email: this.auth.user()?.email || 'Sign in to place an order',
    image: '',
  }));

  readonly profileImageFailed = signal(false);

  readonly appPages: AppPage[] = [
    { title: 'My Account', url: '/account', icon: 'person-outline' },
    { title: 'My Orders', url: '/orders', icon: 'time-outline' },
    { title: 'Manage Orders', url: '/manage-orders', icon: 'settings-outline' },
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: 'grid-outline',
    },
    {
      title: 'List of Products',
      url: '/products',
      icon: 'cube-outline',
    },
    {
      title: 'Cart',
      url: '/cart',
      icon: 'cart-outline',
    },
    {
      title: 'Manage Products',
      url: '/manage-products',
      icon: 'settings-outline',
    },
    {
      title: 'About the App',
      url: '/about',
      icon: 'information-circle-outline',
    },
    {
      title: 'Company History',
      url: '/company-history',
      icon: 'time-outline',
    },
    {
      title: 'Developers',
      url: '/developers',
      icon: 'people-outline',
    },
    {
      title: 'Contact Us',
      url: '/contact-us',
      icon: 'call-outline',
    },
  ];
  readonly visiblePages = computed(() => this.appPages.filter((page) => !page.url.startsWith('/manage-') || this.auth.isAdmin()));

  constructor() {
    addIcons({
      'cube-outline': cubeOutline,
      'grid-outline': gridOutline,
      'cart-outline': cartOutline,
      'information-circle-outline': informationCircleOutline,
      'people-outline': peopleOutline,
      'settings-outline': settingsOutline,
      'time-outline': timeOutline,
      'person-outline': personOutline,
      'call-outline': callOutline,
    });
  }
}
