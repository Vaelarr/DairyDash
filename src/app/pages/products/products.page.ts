import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonSearchbar } from '@ionic/angular';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductService } from '../../services/product.service';
import { CatalogStatusComponent } from '../../components/catalog-status/catalog-status.component';

@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.css'],
  standalone: true,
  imports: [CommonModule, RouterLink, IonSearchbar, PageLayoutComponent, CatalogStatusComponent],
})
export class ProductsPage {
  searchQuery: string = '';

  private readonly productService = inject(ProductService);
  readonly loading = this.productService.loading;
  readonly loadError = this.productService.error;

  ionViewWillEnter() {
    void this.productService.refresh();
  }

  trackById(_: number, product: Product) {
    return product.id;
  }

  get filteredProducts(): Product[] {
    const products = this.productService.products();
    if (!this.searchQuery.trim()) {
      return products;
    }
    const q = this.searchQuery.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }

  handleSearch(event: any) {
    this.searchQuery = event?.detail?.value ?? '';
  }
}
