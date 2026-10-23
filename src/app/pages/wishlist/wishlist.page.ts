import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { WishlistItem } from '../../models/wishlist';
import { SupabaseService } from '../../supabase.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, priceValue, ProductService } from '../../services/product.service';
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
  private readonly wishlist = inject(WishlistService);
  private readonly products = inject(ProductService);
  private readonly cart = inject(CartService);
  readonly auth = inject(SupabaseService);

  private readonly saved = signal<WishlistItem[]>([]);
  private revision = 0;
  readonly items = computed(() => {
    const catalog = new Map(this.products.products().map((product) => [product.id, product]));
    return this.saved().flatMap((entry) => {
      const product = catalog.get(entry.productId);
      return product ? [product] : [];
    });
  });

  readonly refreshing = signal(false);
  readonly removingId = signal<string | null>(null);
  readonly catalogError = signal('');
  readonly feedback = signal('');

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this.revision++;
        this.saved.set([]);
        this.feedback.set('');
        this.catalogError.set('');
        this.removingId.set(null);
        this.refreshing.set(false);
        if (userId) void this.refreshWishlist();
      });
    });
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
    await this.auth.ready.catch(() => undefined);
    const userId = this.auth.user()?.id;
    if (!userId || this.refreshing() || this.removingId()) return;

    const revision = ++this.revision;
    this.refreshing.set(true);
    this.catalogError.set('');

    try {
      const [saved, catalogLoaded] = await Promise.all([
        this.wishlist.list(),
        this.products.refresh(),
      ]);
      if (revision !== this.revision || userId !== this.auth.user()?.id) return;
      this.saved.set(saved);
      if (!catalogLoaded) this.catalogError.set(this.products.error());
    } catch (error) {
      if (revision === this.revision && userId === this.auth.user()?.id) {
        this.catalogError.set(apiErrorMessage(error));
      }
    } finally {
      if (revision === this.revision) this.refreshing.set(false);
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

  async remove(product: Product): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || this.removingId() || this.refreshing()) return;
    const revision = ++this.revision;
    this.removingId.set(product.id);
    this.feedback.set('');
    this.catalogError.set('');
    try {
      await this.wishlist.remove(product.id);
      if (revision !== this.revision || userId !== this.auth.user()?.id) return;
      this.saved.update((items) => items.filter((item) => item.productId !== product.id));
      this.feedback.set(`${product.name} removed from your wishlist.`);
    } catch (error) {
      if (revision === this.revision && userId === this.auth.user()?.id) {
        this.catalogError.set(apiErrorMessage(error));
      }
    } finally {
      if (revision === this.revision) this.removingId.set(null);
    }
  }

  priceValue(product: Product): number {
    return priceValue(product);
  }
}
