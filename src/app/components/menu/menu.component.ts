import { Component, signal } from '@angular/core';
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
  // Sample profile details. Replace these with your own.
  readonly user = {
    name: 'Your Name',
    phone: '09XX XXX XXXX',
    image: 'assets/Profiles/user.jpg',
  };

  readonly profileImageFailed = signal(false);

  readonly appPages: AppPage[] = [
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