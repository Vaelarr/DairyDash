import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonSearchbar } from '@ionic/angular';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { priceValue, ProductService } from '../../services/product.service';
import { ProductCardComponent } from '../../components/product-card/product-card.component';
import { CatalogStatusComponent } from '../../components/catalog-status/catalog-status.component';

@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonSearchbar, PageLayoutComponent, CatalogStatusComponent, ProductCardComponent],
})
export class ProductsPage {
  searchQuery: string = '';
  category = '';
  availableOnly = false;
  sortBy = 'recommended';

  private readonly productService = inject(ProductService);
  readonly loading = this.productService.loading;
  readonly loadError = this.productService.error;
  readonly totalCount = computed(() => this.productService.products().length);
  readonly categories = computed(() => [...new Set(this.productService.products()
    .map((product) => product.category).filter((category): category is string => !!category))].sort());

  get hasFilters(): boolean { return !!this.searchQuery.trim() || !!this.category || this.availableOnly || this.sortBy !== 'recommended'; }

  ionViewWillEnter() {
    void this.productService.refresh();
  }

  trackById(_: number, product: Product) {
    return product.id;
  }

  get filteredProducts(): Product[] {
    const q = this.searchQuery.trim().toLowerCase();
    const products = this.productService.products().filter((product) =>
      (!q || `${product.name} ${product.description}`.toLowerCase().includes(q)) &&
      (!this.category || product.category === this.category) && (!this.availableOnly || product.stock !== 0));
    if (this.sortBy === 'price-asc') products.sort((a, b) => priceValue(a) - priceValue(b));
    else if (this.sortBy === 'price-desc') products.sort((a, b) => priceValue(b) - priceValue(a));
    else if (this.sortBy === 'name') products.sort((a, b) => a.name.localeCompare(b.name));
    return products;
  }

  handleSearch(event: any) {
    this.searchQuery = event?.detail?.value ?? '';
  }

  resetFilters(): void { this.searchQuery = ''; this.category = ''; this.availableOnly = false; this.sortBy = 'recommended'; }
}
