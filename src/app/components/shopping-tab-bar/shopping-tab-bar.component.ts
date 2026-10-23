import { Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { homeOutline, bagHandleOutline, heartOutline, cartOutline, personOutline } from 'ionicons/icons';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-shopping-tab-bar',
  standalone: true,
  imports: [RouterLink, IonIcon],
  templateUrl: './shopping-tab-bar.component.html',
  styleUrl: './shopping-tab-bar.component.css',
})
export class ShoppingTabBarComponent {
  @Input() path = '';
  readonly cart = inject(CartService);
  readonly tabs = [
    { label: 'Home', url: '/dashboard', icon: 'home-outline' },
    { label: 'Shop', url: '/products', icon: 'bag-handle-outline' },
    { label: 'Wishlist', url: '/wishlist', icon: 'heart-outline' },
    { label: 'Cart', url: '/cart', icon: 'cart-outline' },
    { label: 'Account', url: '/account', icon: 'person-outline' },
  ];
  constructor() { addIcons({ 'home-outline': homeOutline, 'bag-handle-outline': bagHandleOutline, 'heart-outline': heartOutline, 'cart-outline': cartOutline, 'person-outline': personOutline }); }
  isActive(url: string): boolean {
    return this.path === url || (url === '/products' && this.path.startsWith('/view-product/')) ||
      (url === '/account' && this.path === '/orders');
  }
}
