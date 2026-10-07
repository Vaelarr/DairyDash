import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonModal, IonSearchbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { createOutline, imageOutline, trash, trashOutline } from 'ionicons/icons';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Product } from '../../models/product';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-manage-products',
  templateUrl: './manage-products.page.html',
  styleUrls: ['./manage-products.page.css'],
  standalone: true,
  imports: [CommonModule, RouterLink, IonIcon, IonModal, IonSearchbar, PageLayoutComponent],
})
export class ManageProductsPage {
  private readonly productService = inject(ProductService);
  private readonly toastCtrl = inject(ToastController);

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
    this.pendingDelete.set(product);
  }

  cancelDelete() {
    this.pendingDelete.set(null);
  }

  async confirmDelete() {
    const product = this.pendingDelete();
    if (!product) return;
    this.pendingDelete.set(null);

    const removed = this.productService.remove(product.id);
    const toast = await this.toastCtrl.create({
      message: removed
        ? `"${product.name}" was deleted.`
        : `Couldn't delete "${product.name}" because the browser's storage is full.`,
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }
}
