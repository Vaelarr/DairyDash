import { Component, Input, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, imageOutline } from 'ionicons/icons';
import { Product } from '../../models/product';
import { CartService } from '../../services/cart.service';
import { LOW_STOCK_THRESHOLD, priceValue } from '../../services/product.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, IonIcon],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  private readonly cart = inject(CartService);
  readonly feedback = signal('');
  readonly lowStockThreshold = LOW_STOCK_THRESHOLD;
  constructor() { addIcons({ 'add-outline': addOutline, 'image-outline': imageOutline }); }
  addToCart(): void {
    const product = this.product;
    const added = this.cart.addProduct({ id: product.id, name: product.name, price: priceValue(product),
      image: product.photo ?? '' }, 1, Math.min(99, product.stock ?? 99));
    this.feedback.set(added ? 'Added to your cart' : 'Cart limit reached for this item');
  }
}
