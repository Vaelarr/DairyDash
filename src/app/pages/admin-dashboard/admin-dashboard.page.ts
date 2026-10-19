import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  chevronForwardOutline,
  cubeOutline,
  settingsOutline,
  statsChartOutline,
  timeOutline,
  trendingDownOutline,
  trendingUpOutline,
  warningOutline,
} from 'ionicons/icons';

import { AdminToolbarBadgeComponent } from '../../components/admin-toolbar-badge/admin-toolbar-badge.component';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Order } from '../../models/order';
import { Product } from '../../models/product';
import { OrderService } from '../../services/order.service';
import { apiErrorMessage, LOW_STOCK_THRESHOLD, ProductService } from '../../services/product.service';

const DAILY_SALES_GOAL = 5000;

/**
 * Sample data for the unguarded `/admin-dashboard-preview` route, which exists purely so the
 * design can be viewed without a working sign-in. Numbers are picked to land on the same totals
 * as the design (₱3,588.00 today, +12%, 72% of goal) — see PREVIEW_ORDERS/PREVIEW_PRODUCTS.
 * Remove this and the preview route once real admin sign-in is wired up and no longer needed for review.
 */
function previewOrders(): Order[] {
  const now = new Date();
  const at = (hoursAgo: number, daysAgo = 0): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(d.getHours() - hoursAgo, 0, 0, 0);
    return d.toISOString();
  };
  const order = (
    id: string,
    status: Order['status'],
    total: number,
    createdAt: string
  ): Order => ({
    id,
    status,
    subtotal: total,
    deliveryFee: 0,
    payment: { method: 'cash_on_delivery', status: 'paid', instructions: '' },
    delivery: { address: null, notes: '' },
    total,
    createdAt,
    updatedAt: createdAt,
    customer: { name: 'Preview Customer', email: '', phone: '', address: '' },
    items: [],
  });
  return [
    // 7 completed + 3 pending + 2 preparing = 12 orders today, summing to ₱3,588.00.
    order('preview-1', 'completed', 400, at(1)),
    order('preview-2', 'completed', 400, at(2)),
    order('preview-3', 'completed', 400, at(2)),
    order('preview-4', 'completed', 400, at(3)),
    order('preview-5', 'completed', 400, at(4)),
    order('preview-6', 'completed', 400, at(5)),
    order('preview-7', 'completed', 200, at(6)),
    order('preview-8', 'pending', 200, at(1)),
    order('preview-9', 'pending', 200, at(2)),
    order('preview-10', 'pending', 200, at(3)),
    order('preview-11', 'preparing', 194, at(2)),
    order('preview-12', 'preparing', 194, at(4)),
    // Yesterday's total (₱3,203.57), for the "vs yesterday" comparison.
    order('preview-13', 'completed', 3203.57, at(10, 1)),
  ];
}

function previewProducts(): Product[] {
  return [
    { id: 'preview-p1', name: 'CreamyButter', description: 'Preview data', price: '₱180.00', stock: 3 },
    { id: 'preview-p2', name: 'CheeseLite', description: 'Preview data', price: '₱210.00', stock: 5 },
    { id: 'preview-p3', name: 'FreshMoo', description: 'Preview data', price: '₱120.00', stock: 22 },
    { id: 'preview-p4', name: 'OatSip', description: 'Preview data', price: '₱150.00', stock: 20 },
  ];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink,
    IonIcon,
    PageLayoutComponent,
    AdminToolbarBadgeComponent,
  ],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.css',
})
export class AdminDashboardPage {
  private readonly orderService = inject(OrderService);
  private readonly productService = inject(ProductService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** True on the unguarded `/admin-dashboard-preview` route; see previewOrders() above. */
  readonly isPreview = inject(ActivatedRoute).snapshot.data['preview'] === true;

  /** Exposed for the template; the constants above stay the single source of truth. */
  readonly lowStockThreshold = LOW_STOCK_THRESHOLD;
  readonly dailySalesGoal = DAILY_SALES_GOAL;

  readonly today = signal(new Date());

  readonly orders = signal<Order[]>([]);
  private readonly liveProducts = this.productService.products;
  readonly products = computed(() => (this.isPreview ? previewProducts() : this.liveProducts()));
  readonly loading = signal(false);
  readonly error = signal('');

  readonly rangeMenuOpen = signal(false);

  // --- Sales -----------------------------------------------------------------------------
  readonly ordersToday = computed(() =>
    this.orders().filter((order) => isSameDay(new Date(order.createdAt), this.today()))
  );
  private readonly ordersYesterday = computed(() => {
    const yesterday = new Date(this.today());
    yesterday.setDate(yesterday.getDate() - 1);
    return this.orders().filter((order) => isSameDay(new Date(order.createdAt), yesterday));
  });

  readonly salesToday = computed(() => sumSales(this.ordersToday()));
  readonly salesYesterday = computed(() => sumSales(this.ordersYesterday()));
  readonly salesChangePct = computed(() => {
    const yesterday = this.salesYesterday();
    const today = this.salesToday();
    if (yesterday <= 0) return today > 0 ? 100 : 0;
    return ((today - yesterday) / yesterday) * 100;
  });
  readonly dailyGoalPct = computed(() =>
    Math.max(0, Math.min(100, Math.round((this.salesToday() / DAILY_SALES_GOAL) * 100)))
  );

  // --- Orders ------------------------------------------------------------------------------
  readonly completedToday = computed(
    () => this.ordersToday().filter((order) => order.status === 'completed').length
  );
  readonly openToday = computed(
    () =>
      this.ordersToday().filter(
        (order) => order.status !== 'completed' && order.status !== 'cancelled'
      ).length
  );
  readonly pendingCount = computed(
    () => this.orders().filter((order) => order.status === 'pending').length
  );
  readonly preparingCount = computed(
    () => this.orders().filter((order) => order.status === 'preparing').length
  );

  // --- Stock -------------------------------------------------------------------------------
  /** Only products with a stock figure set count toward "units in stock"; built-ins may have none. */
  private readonly trackedProducts = computed(() =>
    this.products().filter((product) => product.stock !== undefined)
  );
  readonly unitsInStock = computed(() =>
    this.trackedProducts().reduce((sum, product) => sum + (product.stock ?? 0), 0)
  );
  readonly trackedProductCount = computed(() => this.trackedProducts().length);
  readonly lowStockProducts = computed(() =>
    this.trackedProducts()
      .filter((product) => (product.stock ?? 0) <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))
  );
  readonly lowStockSummary = computed(() => {
    const names = this.lowStockProducts().map((product) => product.name);
    if (names.length <= 2) return names.join(' & ');
    return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
  });

  constructor() {
    addIcons({
      'chevron-down-outline': chevronDownOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'cube-outline': cubeOutline,
      'settings-outline': settingsOutline,
      'stats-chart-outline': statsChartOutline,
      'time-outline': timeOutline,
      'trending-down-outline': trendingDownOutline,
      'trending-up-outline': trendingUpOutline,
      'warning-outline': warningOutline,
    });
  }

  ionViewWillEnter(): void {
    this.today.set(new Date());
    this.rangeMenuOpen.set(false);
    void this.load();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.rangeMenuOpen()) return;
    if (!this.host.nativeElement.querySelector('.range-wrap')?.contains(event.target as Node)) {
      this.rangeMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.rangeMenuOpen.set(false);
  }

  async load(): Promise<void> {
    if (this.isPreview) {
      this.orders.set(previewOrders());
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      // Product refresh failures surface on Manage Products already and shouldn't block the
      // numbers that only need orders, so only the order fetch is treated as fatal here.
      const [orders] = await Promise.all([
        this.orderService.list(true),
        this.productService.refresh(),
      ]);
      this.orders.set(orders);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function sumSales(orders: Order[]): number {
  return orders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + order.total, 0);
}
