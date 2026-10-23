import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  cartOutline,
  heartOutline,
  trashOutline,
} from 'ionicons/icons';
import { Product } from '../../models/product';
import { CartService } from '../../services/cart.service';
import { priceValue, ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
  ],
  templateUrl: './wishlist.page.html',
  styleUrl: './wishlist.page.css',
})
export class WishlistPage {
  readonly wishlist = inject(WishlistService);
  private readonly products = inject(ProductService);
  private readonly cart = inject(CartService);

  readonly refreshing = signal(false);
  readonly catalogError = signal('');
  readonly feedback = signal('');

  constructor() {
    addIcons({
      addOutline,
      cartOutline,
      heartOutline,
      trashOutline,
    });
  }

  ionViewWillEnter(): void {
    void this.refreshWishlist();
  }

  async refreshWishlist(): Promise<void> {
    if (this.refreshing()) {
      return;
    }

    this.refreshing.set(true);
    this.catalogError.set('');

    try {
      if (await this.products.refresh()) {
        this.wishlist.refreshProducts(this.products.products());
      } else {
        this.catalogError.set(this.products.error());
      }
    } finally {
      this.refreshing.set(false);
    }
  }

  addToCart(product: Product): void {
    if (product.stock === 0) {
      this.feedback.set(`${product.name} is out of stock.`);
      return;
    }

    const added = this.cart.addProduct(
      {
        id: product.id,
        name: product.name,
        price: priceValue(product),
        image: product.photo ?? 'assets/Products/AlmondBliss.webp',
      },
      1,
      Math.min(99, product.stock ?? 99)
    );

    this.feedback.set(
      added
        ? `${product.name} added to your cart.`
        : `Unable to add ${product.name}. Check its price and your cart limit.`
    );
  }

  remove(product: Product): void {
    this.wishlist.removeProduct(product.id);
    this.feedback.set(`${product.name} removed from your wishlist.`);
  }

  priceValue(product: Product): number {
    return priceValue(product);
  }
}
