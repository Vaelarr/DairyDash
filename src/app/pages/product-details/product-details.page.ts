import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline, star, starOutline, swapHorizontal } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductReview } from '../../models/product-review';
import { ProductService, apiErrorMessage } from '../../services/product.service';

@Component({
  selector: 'app-product-details',
  templateUrl: './product-details.page.html',
  styleUrls: ['./product-details.page.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonIcon, PageLayoutComponent],
})
export class ProductDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);

  private readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly reviewBusy = signal(false);
  readonly reviewsLoading = signal(false);
  readonly reviewsError = signal('');

  get product(): Product | undefined {
    return this.productService.getById(this.productId);
  }
  quantity = 1;
  isWishlisted = false;
  cartMessage = '';
  reviews: ProductReview[] = [];
  reviewName = '';
  reviewComment = '';
  reviewRating = 0;
  reviewMessage = '';

  constructor() {
    addIcons({
      heart,
      heartOutline,
      star,
      starOutline,
      swapHorizontal,
      'heart-outline': heartOutline,
      'star-outline': starOutline,
      'swap-horizontal': swapHorizontal,
    });

    void this.load();
  }

  ionViewWillEnter() {
    void this.load();
  }

  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const product = await this.productService.fetchById(this.productId);
      if (product) {
        this.quantity = Math.max(1, Math.min(this.quantity, product.stock ?? 99));
        await this.loadReviews();
      }
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async loadReviews() {
    this.reviewsLoading.set(true);
    this.reviewsError.set('');
    try {
      this.reviews = await this.productService.getReviews(this.productId);
    } catch (error) {
      this.reviewsError.set(apiErrorMessage(error));
    } finally {
      this.reviewsLoading.set(false);
    }
  }

  get averageRating(): number {
    if (!this.reviews.length) return 0;
    return this.reviews.reduce((total, review) => total + review.rating, 0) / this.reviews.length;
  }

  get stockCount(): number | undefined {
    return this.product?.stock;
  }

  decreaseQuantity(): void {
    this.quantity = Math.max(1, this.quantity - 1);
  }

  increaseQuantity(): void {
    const maximum = this.stockCount ?? 99;
    this.quantity = Math.min(maximum, this.quantity + 1);
  }

  addToCart(): void {
    if (!this.product) return;
    this.cartMessage = `${this.quantity} × ${this.product.name} added to your cart.`;
  }

  toggleWishlist(): void {
    this.isWishlisted = !this.isWishlisted;
  }

  async submitReview(): Promise<void> {
    if (this.reviewBusy() || this.reviewsLoading()) return;
    const name = this.reviewName.trim();
    const comment = this.reviewComment.trim();
    if (!name || !comment || this.reviewRating < 1) {
      this.reviewMessage = 'Add your name, a rating, and a short review.';
      return;
    }
    if (!this.product) return;

    this.reviewBusy.set(true);
    this.reviewMessage = '';
    try {
      const review = await this.productService.addReview(this.productId, { name, rating: this.reviewRating, comment });
      this.reviews = [review, ...this.reviews];
      this.reviewName = '';
      this.reviewComment = '';
      this.reviewRating = 0;
      this.reviewMessage = 'Thanks for sharing your review.';
    } catch (error) {
      this.reviewMessage = apiErrorMessage(error);
    } finally {
      this.reviewBusy.set(false);
    }
  }
}
