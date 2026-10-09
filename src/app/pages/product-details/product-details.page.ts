import { Component, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline, star, starOutline, swapHorizontal } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductReview } from '../../models/product-review';
import { ProductService, apiErrorMessage, priceValue } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { SupabaseService } from '../../supabase.service';

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
  private readonly cart = inject(CartService);
  readonly auth = inject(SupabaseService);

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
  editingReview: ProductReview | null = null;
  deletingReview: ProductReview | null = null;
  private reviewRevision = 0;
  private reviewerId: string | undefined;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId !== this.reviewerId) {
        this.reviewerId = userId;
        this.cancelReviewEdit(); this.deletingReview = null; this.reviewMessage = '';
      }
    });
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
    if (this.reviewBusy() || this.reviewsLoading()) return;
    const revision = this.reviewRevision;
    this.reviewsLoading.set(true);
    this.reviewsError.set('');
    try {
      const reviews = await this.productService.getReviews(this.productId);
      if (revision === this.reviewRevision) this.reviews = reviews;
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
    const maximum = Math.min(99, this.stockCount ?? 99);
    this.quantity = Math.min(maximum, this.quantity + 1);
  }

  addToCart(): void {
    if (!this.product || this.stockCount === 0) return;
    const existing = this.cart.items().find((item) => item.id === this.product!.id)?.quantity ?? 0;
    const maximum = Math.min(99, this.stockCount ?? 99);
    if (existing + this.quantity > maximum || (existing === 0 && this.cart.items().length >= 50)) {
      this.cartMessage = 'Your cart has reached the available quantity or product limit.';
      return;
    }
    this.cart.addProduct({
      id: this.product.id, name: this.product.name, price: priceValue(this.product),
      image: this.product.photo ?? 'assets/Products/AlmondBliss.webp',
    }, this.quantity);
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
    const userId = this.auth.user()?.id;
    const editing = this.editingReview;
    try {
      const input = { name, rating: this.reviewRating, comment };
      const review = editing
        ? await this.productService.updateReview(this.productId, editing, input)
        : await this.productService.addReview(this.productId, input);
      this.reviewRevision++;
      if (userId !== this.auth.user()?.id) return;
      this.reviews = editing ? this.reviews.map((item) => item.id === review.id ? review : item) : [review, ...this.reviews];
      this.cancelReviewEdit();
      this.reviewMessage = editing ? 'Review updated.' : 'Thanks for sharing your review.';
    } catch (error) {
      if (userId === this.auth.user()?.id) this.reviewMessage = apiErrorMessage(error);
      if (error instanceof HttpErrorResponse && [404, 409].includes(error.status)) {
        this.cancelReviewEdit();
        this.reviewBusy.set(false);
        await this.loadReviews();
      }
    } finally {
      this.reviewBusy.set(false);
    }
  }

  canManageReview(review: ProductReview): boolean {
    return !!this.auth.user() && (this.auth.isAdmin() || review.userId === this.auth.user()?.id);
  }

  editReview(review: ProductReview): void {
    if (this.reviewBusy() || this.reviewsLoading() || !this.canManageReview(review)) return;
    this.editingReview = review;
    this.deletingReview = null;
    this.reviewName = review.name;
    this.reviewComment = review.comment;
    this.reviewRating = review.rating;
    this.reviewMessage = '';
  }

  cancelReviewEdit(): void {
    this.editingReview = null;
    this.reviewName = '';
    this.reviewComment = '';
    this.reviewRating = 0;
  }

  async deleteReview(): Promise<void> {
    const review = this.deletingReview;
    if (!review || this.reviewBusy() || this.reviewsLoading()) return;
    this.reviewBusy.set(true);
    const userId = this.auth.user()?.id;
    try {
      await this.productService.removeReview(this.productId, review);
      this.reviewRevision++;
      if (userId !== this.auth.user()?.id) return;
      this.reviews = this.reviews.filter((item) => item.id !== review.id);
      if (this.editingReview?.id === review.id) this.cancelReviewEdit();
      this.reviewMessage = 'Review deleted.';
    } catch (error) {
      if (userId === this.auth.user()?.id) this.reviewMessage = apiErrorMessage(error);
      this.reviewBusy.set(false);
      await this.loadReviews();
    } finally { this.deletingReview = null; this.reviewBusy.set(false); }
  }
}
