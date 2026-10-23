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
  heartOutline,
  informationCircleOutline,
  peopleOutline,
  settingsOutline,
  statsChartOutline,
  timeOutline,
  personOutline,
  callOutline,
} from 'ionicons/icons';

interface AppPage {
  title: string;
  url: string;
  icon: string;
  /** Only shown to signed-in admins (Manage Products, Manage Orders, Admin Dashboard). */
  adminOnly?: boolean;
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
    { title: 'Manage Orders', url: '/manage-orders', icon: 'settings-outline', adminOnly: true },
    { title: 'Admin Dashboard', url: '/admin-dashboard', icon: 'stats-chart-outline', adminOnly: true },
    {
      title: 'Home',
      url: '/dashboard',
      icon: 'grid-outline',
    },
    {
      title: 'Shop',
      url: '/products',
      icon: 'cube-outline',
    },
    {
      title: 'Cart',
      url: '/cart',
      icon: 'cart-outline',
    },
    {
      title: 'Wishlist',
      url: '/wishlist',
      icon: 'heart-outline',
    },
    {
      title: 'Manage Products',
      url: '/manage-products',
      icon: 'settings-outline',
      adminOnly: true,
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
  readonly visiblePages = computed(() => this.appPages.filter((page) => !page.adminOnly || this.auth.isAdmin()));
  readonly groups = computed(() => [
    { label: 'Shopping', urls: ['/dashboard', '/products', '/wishlist', '/cart'] },
    { label: 'Your account', urls: ['/account', '/orders'] },
    { label: 'Management', urls: ['/admin-dashboard', '/manage-products', '/manage-orders'] },
    { label: 'Discover DairyDash', urls: ['/about', '/company-history', '/developers', '/contact-us'] },
  ].map((group) => ({ label: group.label, pages: group.urls.flatMap((url) => {
    const page = this.visiblePages().find((item) => item.url === url);
    return page ? [page] : [];
  }) })).filter((group) => group.pages.length));

  constructor() {
    addIcons({ cubeOutline, gridOutline, cartOutline, heartOutline, informationCircleOutline, peopleOutline, settingsOutline, statsChartOutline, timeOutline, personOutline, callOutline });
  }
}
