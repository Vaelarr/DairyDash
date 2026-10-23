import { CommonModule } from '@angular/common';
import { Component, Input, booleanAttribute, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { cartOutline } from 'ionicons/icons';
import { CartService } from '../../services/cart.service';
import {
  IonBackButton,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonTitle,
  IonContent,
  IonIcon,
} from '@ionic/angular';

@Component({
  selector: 'app-page-layout',
  templateUrl: './page-layout.component.html',
  styleUrls: ['./page-layout.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonIcon,
    IonBackButton,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonContent,
  ],
})
export class PageLayoutComponent {
  readonly cart = inject(CartService);
  constructor() { addIcons({ 'cart-outline': cartOutline }); }
  @Input() title: string = '';
  /** Big heading in the page body; defaults to `title` (which is also the toolbar text). */
  @Input() heading: string = '';
  @Input() eyebrow: string = '';
  @Input() description: string = '';
  /** Narrower, centered content column (for form pages). */
  @Input({ transform: booleanAttribute }) narrow = false;
  /** When set, the toolbar shows a back arrow to this route instead of the menu button. */
  @Input() backHref: string = '';
}
