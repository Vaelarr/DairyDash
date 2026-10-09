import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

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

import { CartService } from '../../services/cart.service';
import { SupabaseService } from '../../supabase.service';
import { OrderCustomer } from '../../models/order';
import { OrderService } from '../../services/order.service';
import { apiErrorMessage, priceValue, ProductService } from '../../services/product.service';

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
  private readonly orders = inject(OrderService);
  private readonly products = inject(ProductService);
  private readonly router = inject(Router);
  readonly submitting = signal(false);
  readonly refreshing = signal(false);
  readonly feedback = signal('');
  readonly confirmation = signal('');
  customer: OrderCustomer = { name: '', email: '', phone: '', address: '' };

  constructor(
    public cart: CartService,
  ) {
    let customerUserId: string | undefined;
    effect(() => {
      const user = this.auth.user();
      if (user?.id !== customerUserId) {
        customerUserId = user?.id;
        this.customer = { name: user?.user_metadata?.['display_name'] ?? '', email: user?.email ?? '', phone: '', address: '' };
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
    this.customer.name ||= this.auth.user()?.user_metadata?.['display_name'] ?? '';
    this.customer.email ||= this.auth.user()?.email ?? '';
    void this.refreshCart();
  }

  async refreshCart(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      if (await this.products.refresh()) {
        this.cart.refreshProducts(this.products.products().map((product) => ({
          id: product.id, name: product.name, price: priceValue(product), image: product.photo ?? 'assets/Products/AlmondBliss.webp',
        })));
      }
    } finally { this.refreshing.set(false); }
  }

  async checkout(form: NgForm): Promise<void> {
    form.form.markAllAsTouched();
    if (form.invalid || this.submitting() || this.refreshing() || this.cart.items().length === 0) return;
    if (!this.auth.user()) {
      await this.router.navigate(['/account'], { queryParams: { returnUrl: '/cart' } });
      return;
    }
    const purchased = this.cart.items().map((item) => ({ ...item }));
    const userId = this.auth.user()?.id;
    this.submitting.set(true);
    this.feedback.set('');
    this.confirmation.set('');
    try {
      const order = await this.orders.place(this.customer, purchased);
      this.cart.completeCheckout(purchased);
      if (userId === this.auth.user()?.id) this.confirmation.set(`Order ${order.id.slice(0, 8)} was placed. Total: ₱${order.total.toFixed(2)}.`);
    } catch (error) {
      this.feedback.set(apiErrorMessage(error));
      if (error instanceof HttpErrorResponse && error.status === 409) await this.refreshCart();
    } finally { this.submitting.set(false); }
  }
}
