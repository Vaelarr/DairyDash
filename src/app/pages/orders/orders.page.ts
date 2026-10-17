import {
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';

import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  PageLayoutComponent,
} from '../../components/page-layout/page-layout.component';

import {
  Order,
  OrderCustomer,
} from '../../models/order';

import { OrderService } from '../../services/order.service';
import { apiErrorMessage } from '../../services/product.service';
import { SupabaseService } from '../../supabase.service';

import {
  ORDER_PROGRESS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../../models/checkout';

type OrderAction =
  | 'cancel'
  | 'delete'
  | 'paid'
  | 'refunded'
  | 'deliver';

interface OrderChange {
  customer?: OrderCustomer;
  status?: Order['status'];
  paymentStatus?: PaymentStatus;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    PageLayoutComponent,
  ],
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.css',
})
export class OrdersPage {
  private readonly service = inject(OrderService);

  readonly auth = inject(SupabaseService);

  readonly admin =
    inject(ActivatedRoute).snapshot.data['admin'] === true;

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly deliveryError = signal('');

  readonly progress = ORDER_PROGRESS;
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly paymentLabels = PAYMENT_LABELS;
  readonly paymentStatusLabels = PAYMENT_STATUS_LABELS;

  editing: Order | null = null;

  customer: OrderCustomer = {
    name: '',
    email: '',
    phone: '',
    address: '',
  };

  confirmation: {
    order: Order;
    action: OrderAction;
  } | null = null;

  private revision = 0;
  private active = false;
  private currentUserId: string | undefined;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;

      if (userId === this.currentUserId) {
        return;
      }

      this.currentUserId = userId;
      this.revision++;

      this.clearDraft();
      this.orders.set([]);
      this.loading.set(false);
      this.error.set('');
      this.feedback.set('');

      if (this.active && userId) {
        void this.load();
      }
    });
  }

  ionViewWillEnter(): void {
    this.active = true;
    void this.load();
  }

  ionViewDidLeave(): void {
    this.active = false;
    this.revision++;

    this.loading.set(false);
    this.orders.set([]);
    this.error.set('');
    this.feedback.set('');
    this.clearDraft();
  }

  async load(): Promise<void> {
    const revision = ++this.revision;
    const userId = this.auth.user()?.id;

    this.error.set('');

    if (!userId) {
      this.orders.set([]);
      this.loading.set(false);
      return;
    }

    if (!this.hasAccess()) {
      this.orders.set([]);
      this.loading.set(false);
      this.error.set('You do not have access to manage orders.');
      return;
    }

    this.loading.set(true);

    try {
      const orders = await this.service.list(this.admin);

      if (this.isCurrentRequest(revision, userId)) {
        this.orders.set(orders);
      }
    } catch (error) {
      if (this.isCurrentRequest(revision, userId)) {
        this.error.set(apiErrorMessage(error));
      }
    } finally {
      if (revision === this.revision) {
        this.loading.set(false);
      }
    }
  }

  canEdit(order: Order): boolean {
    return (
      this.hasAccess() &&
      (
        order.status === 'pending' ||
        (this.canManage() && order.status === 'confirmed')
      )
    );
  }

  canCancel(order: Order): boolean {
    if (!this.hasAccess()) {
      return false;
    }

    return this.canManage()
      ? [
          'pending',
          'confirmed',
          'preparing',
          'out_for_delivery',
        ].includes(order.status)
      : order.status === 'pending';
  }

  canDelete(order: Order): boolean {
    return (
      this.hasAccess() &&
      order.status === 'cancelled' &&
      ['unpaid', 'cancelled'].includes(order.payment.status)
    );
  }

  canPrepare(order: Order): boolean {
    return (
      order.payment.status === 'paid' ||
      (
        order.payment.method === 'cash_on_delivery' &&
        order.payment.status === 'unpaid'
      )
    );
  }

  canDeliver(order: Order): boolean {
    return (
      this.canManage() &&
      order.status === 'out_for_delivery' &&
      this.canPrepare(order)
    );
  }

  canRecordPayment(order: Order): boolean {
    return (
      this.canManage() &&
      order.payment.status === 'unpaid' &&
      this.canCancel(order)
    );
  }

  canRecordRefund(order: Order): boolean {
    return (
      this.canManage() &&
      order.payment.status === 'refund_pending'
    );
  }

  canAdvance(order: Order, status: Order['status']): boolean {
    if (!this.canManage()) {
      return false;
    }

    switch (status) {
      case 'confirmed':
        return order.status === 'pending';

      case 'preparing':
        return (
          order.status === 'confirmed' &&
          this.canPrepare(order)
        );

      case 'out_for_delivery':
        return (
          order.status === 'preparing' &&
          this.canPrepare(order)
        );

      case 'completed':
        return this.canDeliver(order);

      default:
        return false;
    }
  }

  progressIndex(order: Order): number {
    return this.progress.indexOf(order.status);
  }

  ask(order: Order, action: OrderAction): void {
    if (this.busy() || this.loading()) {
      return;
    }

    if (!this.actionAllowed(order, action)) {
      this.feedback.set(
        'This action is not available for the current order status.'
      );
      return;
    }

    this.clearDraft();
    this.feedback.set('');
    this.confirmation = { order, action };
  }

  confirmationText(): string {
    const selected = this.confirmation;

    if (!selected) {
      return '';
    }

    switch (selected.action) {
      case 'paid':
        return (
          'Have you verified receipt of the full order total? ' +
          'Confirming records the payment as received.'
        );

      case 'refunded':
        return (
          'Have you already returned the full payment to the customer? ' +
          'Confirming records the refund as completed. ' +
          'It does not transfer money.'
        );

      case 'deliver':
        return selected.order.payment.status === 'unpaid'
          ? (
              'Confirm that this cash-on-delivery order was delivered ' +
              'and the courier collected the full order total.'
            )
          : 'Confirm that this order was delivered to the customer.';

      case 'cancel':
        return selected.order.payment.status === 'paid'
          ? (
              'Cancel this order? Its payment will still need a refund. ' +
              'Cancelling does not send money back automatically.'
            )
          : 'Cancel this order? It will no longer continue to delivery.';

      case 'delete':
        return (
          'Permanently delete this cancelled order from history? ' +
          'This action cannot be undone.'
        );
    }
  }

  edit(order: Order): void {
    if (
      this.busy() ||
      this.loading() ||
      !this.canEdit(order)
    ) {
      return;
    }

    this.editing = order;
    this.customer = { ...order.customer };
    this.confirmation = null;
    this.feedback.set('');
    this.deliveryError.set('');
  }

  clearDraft(): void {
    this.editing = null;
    this.confirmation = null;
    this.deliveryError.set('');

    this.customer = {
      name: '',
      email: '',
      phone: '',
      address: '',
    };
  }

  async save(form: NgForm): Promise<void> {
    const order = this.editing;

    if (
      !order ||
      this.busy() ||
      this.loading() ||
      !this.canEdit(order)
    ) {
      return;
    }

    form.form.markAllAsTouched();
    this.deliveryError.set('');

    const customer: OrderCustomer = {
      name: this.customer.name.trim(),
      email: this.customer.email.trim(),
      phone: this.customer.phone.trim(),
      address: this.customer.address.trim(),
    };

    this.customer = customer;

    const valid = Boolean(
      customer.name &&
      customer.name.length <= 80 &&
      customer.email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) &&
      /^[0-9]{7,12}$/.test(customer.phone) &&
      customer.address &&
      customer.address.length <= 500
    );

    if (form.invalid || !valid) {
      this.deliveryError.set(
        'Enter your name, a valid email, a contact number containing ' +
        '7–12 digits, and a complete delivery address.'
      );
      return;
    }

    await this.update(order, { customer });
  }

  async update(
    order: Order,
    change: OrderChange
  ): Promise<void> {
    if (this.busy() || this.loading()) {
      return;
    }

    const customerAllowed =
      change.customer === undefined || this.canEdit(order);

    const statusAllowed =
      change.status === undefined ||
      (
        change.status === 'cancelled'
          ? this.canCancel(order)
          : this.canAdvance(order, change.status)
      );

    const paymentAllowed =
      change.paymentStatus === undefined ||
      (
        change.paymentStatus === 'paid'
          ? this.canRecordPayment(order)
          : (
              change.paymentStatus === 'refunded' &&
              this.canRecordRefund(order)
            )
      );

    if (
      !this.hasAccess() ||
      !customerAllowed ||
      !statusAllowed ||
      !paymentAllowed
    ) {
      this.feedback.set(
        'This change is not available for the current order status.'
      );
      return;
    }

    if (
      change.status === 'completed' &&
      order.payment.status === 'unpaid' &&
      change.paymentStatus !== 'paid'
    ) {
      this.feedback.set(
        'Confirm collection of the cash payment before recording delivery.'
      );
      return;
    }

    await this.mutate(
      order,
      () => this.service.update(order, change, this.admin),
      false
    );
  }

  async confirm(): Promise<void> {
    const selected = this.confirmation;

    if (!selected || this.busy() || this.loading()) {
      return;
    }

    if (!this.actionAllowed(selected.order, selected.action)) {
      this.confirmation = null;
      this.feedback.set(
        'This action is no longer available. Review the order status.'
      );
      return;
    }

    switch (selected.action) {
      case 'cancel':
        await this.update(selected.order, {
          status: 'cancelled',
        });
        break;

      case 'delete':
        await this.mutate(
          selected.order,
          () => this.service.remove(selected.order, this.admin),
          true
        );
        break;

      case 'deliver':
        await this.update(selected.order, {
          status: 'completed',
          ...(
            selected.order.payment.method === 'cash_on_delivery' &&
            selected.order.payment.status === 'unpaid'
              ? { paymentStatus: 'paid' as const }
              : {}
          ),
        });
        break;

      case 'paid':
        await this.update(selected.order, {
          paymentStatus: 'paid',
        });
        break;

      case 'refunded':
        await this.update(selected.order, {
          paymentStatus: 'refunded',
        });
        break;
    }
  }

  private hasAccess(): boolean {
    return (
      !!this.auth.user() &&
      (!this.admin || this.auth.isAdmin())
    );
  }

  private canManage(): boolean {
    return (
      this.hasAccess() &&
      this.admin &&
      this.auth.isAdmin()
    );
  }

  private actionAllowed(
    order: Order,
    action: OrderAction
  ): boolean {
    switch (action) {
      case 'cancel':
        return this.canCancel(order);

      case 'delete':
        return this.canDelete(order);

      case 'paid':
        return this.canRecordPayment(order);

      case 'refunded':
        return this.canRecordRefund(order);

      case 'deliver':
        return this.canDeliver(order);
    }
  }

  private isCurrentRequest(
    revision: number,
    userId: string | undefined
  ): boolean {
    return (
      this.active &&
      revision === this.revision &&
      userId === this.auth.user()?.id
    );
  }

  private async mutate(
    order: Order,
    action: () => Promise<Order | void>,
    remove: boolean
  ): Promise<void> {
    if (
      this.busy() ||
      this.loading() ||
      !this.active ||
      !this.hasAccess()
    ) {
      return;
    }

    const current = this.orders().find(
      (item) => item.id === order.id
    );

    if (!current || current.updatedAt !== order.updatedAt) {
      this.clearDraft();
      this.feedback.set(
        'This order has changed. Review its latest details and try again.'
      );
      return;
    }

    this.busy.set(true);
    this.feedback.set('');

    const userId = this.auth.user()?.id;
    const revision = ++this.revision;

    try {
      const updated = await action();

      if (!this.isCurrentRequest(revision, userId)) {
        return;
      }

      if (remove) {
        this.orders.update((orders) =>
          orders.filter((item) => item.id !== order.id)
        );
      } else if (updated) {
        this.orders.update((orders) =>
          orders.map((item) =>
            item.id === order.id ? updated : item
          )
        );
      } else {
        throw new Error('The server did not return the updated order.');
      }

      this.clearDraft();

      this.feedback.set(
        remove ? 'Order deleted.' : 'Order updated.'
      );
    } catch (error) {
      if (!this.isCurrentRequest(revision, userId)) {
        return;
      }

      this.feedback.set(apiErrorMessage(error));
      this.clearDraft();
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}