import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  chevronForwardOutline,
  clipboardOutline,
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
import { DAILY_SALES_GOAL, LOW_STOCK_THRESHOLD, REPORTING_TIME_ZONE } from '../../data/admin-dashboard';
import { AdminDashboard } from '../../models/admin-dashboard';
import { AdminDashboardService } from '../../services/admin-dashboard.service';
import { apiErrorMessage } from '../../services/product.service';
import { SupabaseService } from '../../supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink, IonIcon, PageLayoutComponent, AdminToolbarBadgeComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.css',
})
export class AdminDashboardPage {
  private readonly dashboard = inject(AdminDashboardService);
  private readonly auth = inject(SupabaseService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private revision = 0;
  private account = '';

  readonly isPreview = inject(ActivatedRoute).snapshot.data['preview'] === true;
  readonly summary = signal<AdminDashboard | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rangeMenuOpen = signal(false);
  readonly today = computed(() => new Date(`${this.summary()?.date ?? '1970-01-01'}T12:00:00+08:00`));
  readonly lowStockThreshold = LOW_STOCK_THRESHOLD;
  readonly dailySalesGoal = DAILY_SALES_GOAL;

  readonly salesToday = computed(() => this.summary()?.today.sales ?? 0);
  readonly salesYesterday = computed(() => this.summary()?.yesterday.sales ?? 0);
  readonly salesChangePct = computed(() => this.summary()?.salesChangePct ?? 0);
  readonly dailyGoalPct = computed(() => this.summary()?.dailyGoalPct ?? 0);
  readonly orderCountToday = computed(() => this.summary()?.today.orderCount ?? 0);
  readonly completedToday = computed(() => this.summary()?.today.completedCount ?? 0);
  readonly openToday = computed(() => this.summary()?.today.openCount ?? 0);
  readonly pendingCount = computed(() => this.summary()?.pendingCount ?? 0);
  readonly preparingCount = computed(() => this.summary()?.preparingCount ?? 0);
  readonly unitsInStock = computed(() => this.summary()?.inventory.unitsInStock ?? 0);
  readonly trackedProductCount = computed(() => this.summary()?.inventory.trackedProductCount ?? 0);
  readonly lowStockProducts = computed(() => this.summary()?.inventory.lowStockProducts ?? []);
  readonly lowStockSummary = computed(() => {
    const names = this.lowStockProducts().map((product) => product.name);
    return names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
  });

  constructor() {
    effect(() => {
      const account = `${this.auth.user()?.id ?? ''}:${this.auth.isAdmin()}`;
      if (this.isPreview || account === this.account) return;
      this.account = account;
      this.revision++;
      this.summary.set(null);
      this.error.set('');
      this.loading.set(false);
    });
    addIcons({
      'chevron-down-outline': chevronDownOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'clipboard-outline': clipboardOutline,
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
    this.rangeMenuOpen.set(false);
    void this.load();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
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
      // The existing public design preview uses only explicit sample totals.
      this.summary.set({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TIME_ZONE }).format(new Date()),
        timeZone: REPORTING_TIME_ZONE, dailySalesGoal: DAILY_SALES_GOAL, lowStockThreshold: LOW_STOCK_THRESHOLD,
        today: { sales: 3588, orderCount: 12, completedCount: 7, openCount: 5 },
        yesterday: { sales: 3203.57 }, salesChangePct: 12, dailyGoalPct: 72,
        pendingCount: 3, preparingCount: 2,
        inventory: { unitsInStock: 50, trackedProductCount: 4, lowStockProducts: [
          { id: 'preview-p1', name: 'CreamyButter', stock: 3 },
          { id: 'preview-p2', name: 'CheeseLite', stock: 5 },
        ] },
      });
      return;
    }
    await this.auth.ready.catch(() => undefined);
    if (this.loading()) return;
    // Establish the same identity as the auth effect before starting this request.
    this.account = `${this.auth.user()?.id ?? ''}:${this.auth.isAdmin()}`;
    const account = this.account;
    const revision = ++this.revision;
    this.loading.set(true);
    this.summary.set(null);
    this.error.set('');
    try {
      const summary = await this.dashboard.load();
      if (revision === this.revision && account === `${this.auth.user()?.id ?? ''}:${this.auth.isAdmin()}`) {
        this.summary.set(summary);
      }
    } catch (error) {
      if (revision === this.revision) this.error.set(apiErrorMessage(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
}
