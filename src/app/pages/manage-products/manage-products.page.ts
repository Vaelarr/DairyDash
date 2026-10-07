import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonModal, IonSearchbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, imageOutline, trash, trashOutline } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductService, apiErrorMessage } from '../../services/product.service';
import { CatalogStatusComponent } from '../../components/catalog-status/catalog-status.component';

@Component({
  selector: 'app-manage-products',
  templateUrl: './manage-products.page.html',
  styleUrls: ['./manage-products.page.css'],
  standalone: true,
  imports: [CommonModule, RouterLink, IonIcon, IonModal, IonSearchbar, PageLayoutComponent, CatalogStatusComponent],
})
export class ManageProductsPage {
  private readonly productService = inject(ProductService);
  private readonly toastCtrl = inject(ToastController);
  readonly loading = this.productService.loading;
  readonly loadError = this.productService.error;
  readonly deleting = signal(false);
  readonly deleteError = signal('');

  readonly searchQuery = signal('');
  readonly total = computed(() => this.productService.products().length);
  readonly filtered = computed(() => {
    const products = this.productService.products();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  });

  /** The product the user is being asked to confirm deleting. */
  readonly pendingDelete = signal<Product | null>(null);

  constructor() {
    addIcons({ createOutline, imageOutline, trash, trashOutline });
  }

  ionViewWillEnter() {
    void this.productService.refresh();
  }

  trackById(_: number, product: Product) {
    return product.id;
  }

  stockLabel(product: Product): string {
    if (product.stock === undefined) return 'Stock not set';
    return product.stock === 0 ? 'Out of stock' : `In stock: ${product.stock}`;
  }

  handleSearch(event: any) {
    this.searchQuery.set(event?.detail?.value ?? '');
  }

  askToDelete(product: Product) {
    this.deleteError.set('');
    this.pendingDelete.set(product);
  }

  cancelDelete() {
    if (this.deleting()) return;
    this.pendingDelete.set(null);
  }

  async confirmDelete() {
    const product = this.pendingDelete();
    if (!product || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set('');
    try {
      await this.productService.remove(product.id);
      this.pendingDelete.set(null);
      const toast = await this.toastCtrl.create({
        message: `"${product.name}" was deleted.`,
        duration: 2500,
        position: 'bottom',
      });
      await toast.present();
    } catch (error) {
      this.deleteError.set(apiErrorMessage(error));
    } finally {
      this.deleting.set(false);
    }
  }
}
