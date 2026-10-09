import { Component, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageLayoutComponent } from '../../components/page-layout/page-layout.component';
import { Order, OrderCustomer } from '../../models/order';
import { OrderService } from '../../services/order.service';
import { apiErrorMessage } from '../../services/product.service';
import { SupabaseService } from '../../supabase.service';
import { ORDER_PROGRESS, ORDER_STATUS_LABELS, PAYMENT_LABELS, PAYMENT_STATUS_LABELS, PaymentStatus } from '../../models/checkout';

@Component({
  selector: 'app-orders', standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, PageLayoutComponent],
  templateUrl: './orders.page.html', styleUrl: './orders.page.css',
})
export class OrdersPage {
  private readonly service = inject(OrderService);
  readonly auth = inject(SupabaseService);
  readonly admin = inject(ActivatedRoute).snapshot.data['admin'] === true;
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  editing: Order | null = null;
  customer: OrderCustomer = { name: '', email: '', phone: '', address: '' };
  confirmation: { order: Order; action: 'cancel' | 'delete' | 'paid' | 'refunded' | 'deliver' } | null = null;
  readonly progress = ORDER_PROGRESS;
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly paymentLabels = PAYMENT_LABELS;
  readonly paymentStatusLabels = PAYMENT_STATUS_LABELS;
  private revision = 0;
  private active = false;
  private currentUserId: string | undefined;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId !== this.currentUserId) {
        this.currentUserId = userId;
        this.clearDraft(); this.orders.set([]); this.revision++;
        if (this.active && userId) void this.load();
      }
    });
  }

  ionViewWillEnter(): void { this.active = true; void this.load(); }
  ionViewDidLeave(): void { this.active = false; this.revision++; this.orders.set([]); this.clearDraft(); }

  async load(): Promise<void> {
    const revision = ++this.revision;
    const userId = this.auth.user()?.id;
    this.loading.set(true);
    this.error.set('');
    try {
      const orders = await this.service.list(this.admin);
      if (this.active && revision === this.revision && userId === this.auth.user()?.id) this.orders.set(orders);
    } catch (error) {
      if (this.active && revision === this.revision && userId === this.auth.user()?.id) this.error.set(apiErrorMessage(error));
    } finally { if (revision === this.revision) this.loading.set(false); }
  }

  canEdit(order: Order): boolean { return order.status === 'pending' || (this.admin && order.status === 'confirmed'); }
  canCancel(order: Order): boolean { return this.admin ? ['pending', 'confirmed', 'preparing', 'out_for_delivery'].includes(order.status) : order.status === 'pending'; }
  canDelete(order: Order): boolean {
    return order.payment.status !== 'refund_pending' &&
      !(order.payment.status === 'paid' && this.canCancel(order)) &&
      (this.admin || ['pending', 'cancelled'].includes(order.status));
  }
  progressIndex(order: Order): number { return this.progress.indexOf(order.status); }
  canPrepare(order: Order): boolean { return order.payment.method === 'cash_on_delivery' || !order.payment.method || order.payment.status === 'paid'; }
  canRecordPayment(order: Order): boolean { return this.admin && order.payment.status === 'unpaid' && this.canCancel(order); }
  ask(order: Order, action: NonNullable<OrdersPage['confirmation']>['action']): void { this.confirmation = { order, action }; this.editing = null; }
  confirmationText(): string {
    const selected = this.confirmation;
    if (!selected) return '';
    if (selected.action === 'paid') return 'Have you verified receipt of the full order total? This records payment as received.';
    if (selected.action === 'refunded') return 'Have you returned the full payment to the customer? This records the refund as completed.';
    if (selected.action === 'deliver') return selected.order.payment.status === 'unpaid'
      ? 'Confirm this order was delivered and the courier collected the full amount in cash.' : 'Confirm this order was delivered to the customer.';
    if (selected.action === 'cancel') return selected.order.payment.status === 'paid'
      ? 'Cancel this order and release reserved stock? Its payment will be marked as refund pending. Return the payment separately, then record the refund.'
      : 'Cancel this order? Reserved stock will be released.';
    return 'Delete this order from history? An active order will be cancelled and its stock released.';
  }

  edit(order: Order): void {
    if (this.busy()) return;
    this.editing = order;
    this.customer = { ...order.customer };
    this.confirmation = null;
    this.feedback.set('');
  }

  clearDraft(): void { this.editing = null; this.confirmation = null; this.customer = { name: '', email: '', phone: '', address: '' }; }

  async save(): Promise<void> {
    if (this.editing) await this.update(this.editing, { customer: { ...this.customer } });
  }

  async update(order: Order, change: { customer?: OrderCustomer; status?: Order['status']; paymentStatus?: PaymentStatus }): Promise<void> {
    await this.mutate(order, async () => this.service.update(order, change, this.admin), false);
  }

  async confirm(): Promise<void> {
    const confirmation = this.confirmation;
    if (!confirmation) return;
    if (confirmation.action === 'cancel') await this.update(confirmation.order, { status: 'cancelled' });
    else if (confirmation.action === 'delete') await this.mutate(confirmation.order, async () => { await this.service.remove(confirmation.order, this.admin); }, true);
    else if (confirmation.action === 'deliver') await this.update(confirmation.order, { status: 'completed',
      ...(confirmation.order.payment.status === 'unpaid' ? { paymentStatus: 'paid' as const } : {}) });
    else await this.update(confirmation.order, { paymentStatus: confirmation.action });
  }

  private async mutate(order: Order, action: () => Promise<Order | void>, remove: boolean): Promise<void> {
    if (this.busy() || this.loading()) return;
    this.busy.set(true);
    this.feedback.set('');
    const userId = this.auth.user()?.id;
    this.revision++;
    try {
      const updated = await action();
      if (!this.active || userId !== this.auth.user()?.id) return;
      this.orders.update((orders) => remove ? orders.filter((item) => item.id !== order.id)
        : orders.map((item) => item.id === order.id ? updated as Order : item));
      this.clearDraft();
      this.feedback.set(remove ? 'Order deleted.' : 'Order updated.');
    } catch (error) {
      if (!this.active || userId !== this.auth.user()?.id) return;
      this.feedback.set(apiErrorMessage(error));
      this.clearDraft();
      await this.load();
    } finally { this.busy.set(false); }
  }
}
