import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import {
  HeroCarouselComponent,
  HeroSlide,
} from '../../components/hero-carousel/hero-carousel.component';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.css'],
  standalone: true,
  imports: [CommonModule, RouterModule, PageLayoutComponent, HeroCarouselComponent],
})
export class DashboardPage {
  heroSlides: HeroSlide[] = [
    {
      tag: 'New Arrivals',
      title: 'Fresh From the Farm',
      subtitle: 'Premium dairy products delivered to your door',
      photo: 'assets/Carousel/Milk.png',
    },
    {
      tag: 'Limited Time',
      title: 'Weekend Discounts',
      subtitle: 'Save on your favorite dairy essentials',
      photo: 'assets/Carousel/MilkDiscounts.png',
    },
    {
      tag: 'Just In',
      title: 'New Flavors Added',
      subtitle: 'Try our latest seasonal creations',
      photo: 'assets/Carousel/MoreMilk.png',
    },
  ];

  /** The dashboard's featured products come from the shared catalog, so edits show up here too. */
  featuredProducts = inject(ProductService).featured;
}
