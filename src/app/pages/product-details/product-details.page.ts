import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline, star, starOutline, swapHorizontal } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductService } from '../../services/product.service';

interface ProductReview {
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
}

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

  readonly product: Product | undefined = this.productService.getById(
    this.route.snapshot.paramMap.get('id') ?? ''
  );
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

    this.reviews = this.loadReviews();
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

  submitReview(): void {
    const name = this.reviewName.trim();
    const comment = this.reviewComment.trim();
    if (!name || !comment || this.reviewRating < 1) {
      this.reviewMessage = 'Add your name, a rating, and a short review.';
      return;
    }
    if (!this.product) return;

    const review: ProductReview = {
      name,
      rating: this.reviewRating,
      comment,
      createdAt: new Date().toISOString(),
    };
    const nextReviews = [review, ...this.reviews];
    try {
      localStorage.setItem(this.reviewStorageKey, JSON.stringify(nextReviews));
      this.reviews = nextReviews;
      this.reviewName = '';
      this.reviewComment = '';
      this.reviewRating = 0;
      this.reviewMessage = 'Thanks for sharing your review.';
    } catch {
      this.reviewMessage = 'Your review could not be saved in this browser.';
    }
  }

  private get reviewStorageKey(): string {
    return `milkswift.product-reviews.${this.product?.id ?? 'missing'}`;
  }

  private loadReviews(): ProductReview[] {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(this.reviewStorageKey) ?? '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(
        (review): review is ProductReview =>
          typeof review?.name === 'string' &&
          typeof review?.comment === 'string' &&
          Number.isInteger(review?.rating) &&
          review.rating >= 1 &&
          review.rating <= 5 &&
          typeof review?.createdAt === 'string'
      );
    } catch {
      return [];
    }
  }
}