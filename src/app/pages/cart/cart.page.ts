import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonRouterLink,
  IonThumbnail,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  cartOutline,
  addOutline,
  removeOutline,
  trashOutline,
  bagCheckOutline,
} from 'ionicons/icons';

import { CartItem, CartService } from '../../services/cart.service';
import { SupabaseService } from '../../supabase.service';
import { priceValue, ProductService } from '../../services/product.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IonRouterLink,
    CurrencyPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonContent,
    IonThumbnail,
    IonButton,
    IonIcon,
  ],
  templateUrl: './cart.page.html',
  styleUrl: './cart.page.css',
})
export class CartPage {
  readonly auth = inject(SupabaseService);
  private readonly products = inject(ProductService);
  readonly submitting = signal(false);
  readonly refreshing = signal(false);
  readonly feedback = signal('');
  readonly confirmation = signal('');
  readonly catalogReady = signal(false);
  readonly cartIssues = computed(() => this.cart.items().map((item) => this.itemIssue(item)).filter(Boolean));

  constructor(
    public cart: CartService,
  ) {
    let customerUserId: string | undefined;
    effect(() => {
      const user = this.auth.user();
      if (user?.id !== customerUserId) {
        customerUserId = user?.id;
        this.confirmation.set('');
        this.feedback.set('');
      }
    });
    addIcons({
      cartOutline,
      addOutline,
      removeOutline,
      trashOutline,
      bagCheckOutline,
    });
  }

  ionViewWillEnter(): void {
    void this.refreshCart();
  }

  async refreshCart(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.catalogReady.set(false);
    try {
      if (await this.products.refresh()) {
        this.catalogReady.set(true);
        this.cart.refreshProducts(this.products.products().map((product) => ({
          id: product.id, name: product.name, price: priceValue(product), image: product.photo ?? 'assets/Products/AlmondBliss.webp',
        })));
        this.feedback.set('');
      } else this.feedback.set(this.products.error());
    } finally { this.refreshing.set(false); }
  }

  itemIssue(item: CartItem): string {
    if (!this.catalogReady()) return '';
    const product = this.products.getById(String(item.id));
    if (!product) return `${item.name} is no longer available. Remove it to continue.`;
    if (product.stock === 0) return `${item.name} is out of stock. Remove it to continue.`;
    if (product.stock !== undefined && item.quantity > product.stock) return `${item.name}: only ${product.stock} available. Reduce the quantity to continue.`;
    return '';
  }

  maxQuantity(item: CartItem): number {
    return Math.min(99, this.products.getById(String(item.id))?.stock ?? 99);
  }

}
