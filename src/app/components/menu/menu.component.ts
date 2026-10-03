import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cubeOutline,
  gridOutline,
  informationCircleOutline,
  peopleOutline,
  settingsOutline,
  timeOutline,
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
    CommonModule,
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
  ],
})
export class MenuComponent {
  appPages: AppPage[] = [
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
  ];

  constructor() {
    addIcons({
      cubeOutline,
      gridOutline,
      informationCircleOutline,
      peopleOutline,
      settingsOutline,
      timeOutline,
      'settings-outline': settingsOutline,
      'cube-outline': cubeOutline,
      'grid-outline': gridOutline,
      'information-circle-outline': informationCircleOutline,
      'people-outline': peopleOutline,
      'time-outline': timeOutline,
    });
  }
}
