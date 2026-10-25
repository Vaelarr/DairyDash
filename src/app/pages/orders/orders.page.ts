import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  callOutline,
  checkmarkCircleOutline,
  chevronForwardOutline,
  closeCircleOutline,
  createOutline,
  cubeOutline,
  locationOutline,
  mailOutline,
  personOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  AdminToolbarBadgeComponent,
} from '../../components/admin-toolbar-badge/admin-toolbar-badge.component';

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

export type OrderFilter =
  | 'all'
  | 'pending'
  | 'preparing'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

interface OrderChange {
  customer?: OrderCustomer;
  status?: Order['status'];
  paymentStatus?: PaymentStatus;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    IonIcon,
    IonSearchbar,
    PageLayoutComponent,
    AdminToolbarBadgeComponent,
  ],
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.css',
})
export class OrdersPage {
  private readonly service = inject(OrderService);
  private readonly route = inject(ActivatedRoute);

  readonly auth = inject(SupabaseService);

  readonly admin =
    this.route.snapshot.data['admin'] === true;

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly deliveryError = signal('');

  readonly statusFilter = signal<OrderFilter>('all');
  readonly searchQuery = signal('');

  readonly progress = ORDER_PROGRESS;
  readonly statusLabels = ORDER_STATUS_LABELS;
  readonly paymentLabels = PAYMENT_LABELS;
  readonly paymentStatusLabels = PAYMENT_STATUS_LABELS;

  readonly pendingCount = computed(
    () => this.orders().filter((o) => o.status === 'pending').length
  );
  readonly preparingCount = computed(
    () =>
      this.orders().filter(
        (o) => o.status === 'confirmed' || o.status === 'preparing'
      ).length
  );
  readonly deliveryCount = computed(
    () =>
      this.orders().filter((o) => o.status === 'out_for_delivery').length
  );
  readonly completedCount = computed(
    () => this.orders().filter((o) => o.status === 'completed').length
  );
  readonly cancelledCount = computed(
    () => this.orders().filter((o) => o.status === 'cancelled').length
  );

  readonly visibleOrders = computed(() => {
    let list = this.orders();
    if (!this.admin) return list;

    const filter = this.statusFilter();
    if (filter === 'pending') {
      list = list.filter((o) => o.status === 'pending');
    } else if (filter === 'preparing') {
      list = list.filter(
        (o) => o.status === 'confirmed' || o.status === 'preparing'
      );
    } else if (filter === 'out_for_delivery') {
      list = list.filter((o) => o.status === 'out_for_delivery');
    } else if (filter === 'completed') {
      list = list.filter((o) => o.status === 'completed');
    } else if (filter === 'cancelled') {
      list = list.filter((o) => o.status === 'cancelled');
    }

    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.phone.toLowerCase().includes(q) ||
          o.customer.address.toLowerCase().includes(q)
      );
    }
    return list;
  });

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
    addIcons({
      'call-outline': callOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'close-circle-outline': closeCircleOutline,
      'create-outline': createOutline,
      'cube-outline': cubeOutline,
      'location-outline': locationOutline,
      'mail-outline': mailOutline,
      'person-outline': personOutline,
      'time-outline': timeOutline,
      'trash-outline': trashOutline,
    });

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
    const statusParam = this.route.snapshot.queryParamMap.get(
      'status'
    ) as OrderFilter | null;
    if (
      statusParam &&
      [
        'pending',
        'preparing',
        'out_for_delivery',
        'completed',
        'cancelled',
      ].includes(statusParam)
    ) {
      this.statusFilter.set(statusParam);
    }
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

  handleSearch(event: any): void {
    this.searchQuery.set(event?.detail?.value ?? '');
  }

  clearSearch(): void {
    this.searchQuery.set('');
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
          'Marking this order as paid records payment verification and unlocks preparation.'
        );

      case 'refunded':
        return (
          'Has the refund for this order been completed? ' +
          'Marking this order as refunded closes the pending refund status.'
        );

      case 'cancel':
        return this.admin
          ? 'Are you sure you want to cancel this customer order? Restoring inventory will be recorded automatically.'
          : 'Are you sure you want to cancel this order? Any eligible refund or inventory adjustment will be processed.';

      case 'delete':
        return 'Delete this cancelled order from history? This cannot be undone.';

      case 'deliver':
        return selected.order.payment.method === 'cash_on_delivery' &&
          selected.order.payment.status === 'unpaid'
          ? 'Confirm delivery and that cash payment was received in full?'
          : 'Confirm that this order has been successfully delivered to the customer?';

      default:
        return 'Are you sure you want to continue?';
    }
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

  edit(order: Order): void {
    if (this.busy() || this.loading() || !this.canEdit(order)) {
      return;
    }

    this.confirmation = null;
    this.feedback.set('');
    this.deliveryError.set('');
    this.editing = order;
    this.customer = {
      name: order.customer.name,
      email: order.customer.email,
      phone: order.customer.phone,
      address: order.customer.address,
    };
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

    if (!order) {
      return;
    }

    const customer = {
      name: this.customer.name.trim(),
      email: this.customer.email.trim(),
      phone: this.customer.phone.trim(),
      address: this.customer.address.trim(),
    };

    if (
      !form.valid ||
      !customer.name ||
      !customer.email ||
      !customer.address ||
      !/^[0-9]{7,12}$/.test(customer.phone)
    ) {
      this.deliveryError.set(
        'Enter a recipient name, valid email, phone number with ' +
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
