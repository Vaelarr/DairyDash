import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { carOutline, leafOutline, peopleOutline, storefrontOutline, waterOutline } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';

interface HistoryPoint {
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-company-history',
  templateUrl: './company-history.page.html',
  styleUrls: ['./company-history.page.css'],
  standalone: true,
  imports: [CommonModule, IonIcon, PageLayoutComponent],
})
export class CompanyHistoryPage {
  history: HistoryPoint[] = [
    {
      title: 'A simple purpose',
      description: 'The Dairy Dash story centers on bringing fresh, premium dairy from local farms directly to urban families.',
      icon: 'leaf-outline',
    },
    {
      title: 'Rooted in local farms',
      description: 'Local farm partnerships are at the heart of our mission: quality dairy with no antibiotics or added hormones.',
      icon: 'people-outline',
    },
    {
      title: 'From farm to your door',
      description: 'Freshness guides every step. Milk is bottled, chilled, and delivered within 24 hours of milking.',
      icon: 'car-outline',
    },
  ];

  constructor() {
    addIcons({
      carOutline,
      leafOutline,
      peopleOutline,
      storefrontOutline,
      waterOutline,
      'car-outline': carOutline,
      'leaf-outline': leafOutline,
      'people-outline': peopleOutline,
      'storefront-outline': storefrontOutline,
      'water-outline': waterOutline,
    });
  }
}