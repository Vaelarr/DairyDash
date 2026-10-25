import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonModal, IonSearchbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronDownOutline,
  closeCircleOutline,
  createOutline,
  imageOutline,
  informationCircleOutline,
  trash,
  trashOutline,
} from 'ionicons/icons';

import { AdminToolbarBadgeComponent } from '../../components/admin-toolbar-badge/admin-toolbar-badge.component';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { CatalogStatusComponent } from '../../components/catalog-status/catalog-status.component';
import { Product } from '../../models/product';
import { LOW_STOCK_THRESHOLD, ProductService, apiErrorMessage, priceValue } from '../../services/product.service';

type StatusFilter = 'all' | 'low' | 'out';
type SortBy = 'newest' | 'name' | 'price-asc' | 'price-desc' | 'stock-asc';

const SORT_LABELS: Record<SortBy, string> = {
  newest: 'Newest first',
  name: 'Name (A–Z)',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
  'stock-asc': 'Stock: Low to High',
};

interface StockBadge {
  label: string;
  cssClass: string;
}

/**
 * Sample data for the unguarded `/manage-products-preview` route, which exists purely so the
 * design can be viewed without a working sign-in — see admin-dashboard.page.ts for the same
 * pattern. Matches the design's 4 products exactly. Delete works against this local copy (it's
 * never sent anywhere), so the full flow can be tried without touching anything real.
 * Remove this and the preview route once real admin sign-in is wired up and no longer needed.
 */
function previewProducts(): Product[] {
  return [
    { id: 'preview-1', name: 'MilkMoo', description: 'Preview data', price: '₱299.00', stock: 24 },
    { id: 'preview-2', name: 'ChocoMilk', description: 'Preview data', price: '₱199.00', stock: 18 },
    { id: 'preview-3', name: 'CreamyButter', description: 'Preview data', price: '₱149.00', stock: 5 },
    { id: 'preview-4', name: 'CheeseLite', description: 'Preview data', price: '₱179.00', stock: 3 },
  ];
}

@Component({
  selector: 'app-manage-products',
  templateUrl: './manage-products.page.html',
  styleUrls: ['./manage-products.page.css'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonIcon,
    IonModal,
    IonSearchbar,
    PageLayoutComponent,
    CatalogStatusComponent,
    AdminToolbarBadgeComponent,
  ],
})
export class ManageProductsPage {
  private readonly productService = inject(ProductService);
  private readonly toastCtrl = inject(ToastController);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly route = inject(ActivatedRoute);

  readonly lowStockThreshold = LOW_STOCK_THRESHOLD;

  /** True on the unguarded `/manage-products-preview` route; see previewProducts() above. */
  readonly isPreview = this.route.snapshot.data['preview'] === true;
  private readonly previewList = signal<Product[]>(previewProducts());

  readonly loading = this.productService.loading;
  readonly loadError = this.productService.error;
  readonly deleting = signal(false);
  readonly deleteError = signal('');

  readonly searchQuery = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly sortBy = signal<SortBy>('newest');
  readonly sortMenuOpen = signal(false);

  private readonly liveProducts = this.productService.products;
  private readonly allProducts = computed(() =>
    this.isPreview ? this.previewList() : this.liveProducts()
  );
  readonly allCount = computed(() => this.allProducts().length);
  readonly lowStockCount = computed(
    () => this.allProducts().filter((p) => p.stock !== undefined && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length
  );
  readonly outOfStockCount = computed(
    () => this.allProducts().filter((p) => p.stock === 0).length
  );

  /** Products matching the active status chip, before search or sort. */
  private readonly statusFiltered = computed(() => {
    const products = this.allProducts();
    if (this.statusFilter() === 'low') {
      return products.filter((p) => p.stock !== undefined && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD);
    }
    if (this.statusFilter() === 'out') {
      return products.filter((p) => p.stock === 0);
    }
    return products;
  });

  private readonly searched = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.statusFiltered();
    return this.statusFiltered().filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  });

  /** The list actually shown: status chip, then search, then sort applied. */
  readonly visibleProducts = computed(() => {
    const products = [...this.searched()];
    switch (this.sortBy()) {
      case 'name':
        return products.sort((a, b) => a.name.localeCompare(b.name));
      case 'price-asc':
        return products.sort((a, b) => priceValue(a) - priceValue(b));
      case 'price-desc':
        return products.sort((a, b) => priceValue(b) - priceValue(a));
      case 'stock-asc':
        return products.sort((a, b) => (a.stock ?? Infinity) - (b.stock ?? Infinity));
      case 'newest':
      default:
        // The catalog is assumed newest-first already (new products are added to the front).
        return products;
    }
  });

  readonly sortLabel = computed(() => SORT_LABELS[this.sortBy()]);

  /** "All Products (4)" / "Low Stock (2)" / "Out of Stock (1)" / "Results (1 of 4)" while searching. */
  readonly listHeading = computed(() => {
    const base = this.statusFiltered();
    if (this.searchQuery().trim()) {
      return `Results (${this.searched().length} of ${base.length})`;
    }
    const label =
      this.statusFilter() === 'low'
        ? 'Low Stock'
        : this.statusFilter() === 'out'
          ? 'Out of Stock'
          : 'All Products';
    return `${label} (${base.length})`;
  });

  /** The product the user is being asked to confirm deleting. */
  readonly pendingDelete = signal<Product | null>(null);

  constructor() {
    addIcons({
      'add-outline': addOutline,
      'chevron-down-outline': chevronDownOutline,
      'close-circle-outline': closeCircleOutline,
      'create-outline': createOutline,
      'image-outline': imageOutline,
      'information-circle-outline': informationCircleOutline,
      trash,
      'trash-outline': trashOutline,
    });
  }

  ionViewWillEnter() {
    this.sortMenuOpen.set(false);
    const filterParam = this.route.snapshot.queryParamMap.get('filter');
    if (filterParam === 'low' || filterParam === 'out' || filterParam === 'all') {
      this.statusFilter.set(filterParam as StatusFilter);
    }
    if (!this.isPreview) void this.productService.refresh();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.sortMenuOpen()) return;
    if (!this.host.nativeElement.querySelector('.sort-wrap')?.contains(event.target as Node)) {
      this.sortMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.sortMenuOpen.set(false);
  }

  trackById(_: number, product: Product) {
    return product.id;
  }

  setSort(value: SortBy) {
    this.sortBy.set(value);
    this.sortMenuOpen.set(false);
  }

  clearSearch() {
    this.searchQuery.set('');
  }

  /** Right-aligned count text on each row, e.g. "24 in stock" / "Out of stock" / "Stock not set". */
  stockText(product: Product): string {
    if (product.stock === undefined) return 'Stock not set';
    return product.stock === 0 ? 'Out of stock' : `${product.stock} in stock`;
  }

  stockBadge(product: Product): StockBadge | null {
    if (product.stock === undefined) return null;
    if (product.stock === 0) return { label: 'Out of stock', cssClass: 'badge-out' };
    if (product.stock <= LOW_STOCK_THRESHOLD) return { label: 'Low stock', cssClass: 'badge-low' };
    return { label: 'In stock', cssClass: 'badge-in' };
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

    if (this.isPreview) {
      this.previewList.update((list) => list.filter((p) => p.id !== product.id));
      this.pendingDelete.set(null);
      const toast = await this.toastCtrl.create({
        message: `"${product.name}" was deleted. (preview only — nothing real was changed)`,
        duration: 3000,
        position: 'bottom',
      });
      await toast.present();
      return;
    }

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
