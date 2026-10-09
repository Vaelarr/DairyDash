import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, type NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';
import { CartService, CartItem } from '../../services/cart.service';
import { CheckoutPreferencesService, SavedAddress } from '../../services/checkout-preferences.service';
import { Order, OrderCustomer } from '../../models/order';
import { CheckoutOptions, PaymentMethod, ShippingAddress, formatAddress, PAYMENT_LABELS } from '../../models/checkout';
import { OrderService } from '../../services/order.service';
import { SupabaseService } from '../../supabase.service';
import { apiErrorMessage, priceValue, ProductService } from '../../services/product.service';

type CheckoutStep = 'delivery' | 'payment' | 'review' | 'confirmation';
const blankAddress = (): ShippingAddress => ({ line1: '', line2: '', barangay: '', city: '', province: '', postalCode: '', country: 'PH' });

@Component({
  selector: 'app-checkout', standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonMenuButton, IonTitle, IonToolbar],
  templateUrl: './checkout.page.html', styleUrl: './checkout.page.css',
})
export class CheckoutPage {
  readonly auth = inject(SupabaseService);
  readonly cart = inject(CartService);
  private readonly orders = inject(OrderService);
  private readonly products = inject(ProductService);
  private readonly preferences = inject(CheckoutPreferencesService);
  private readonly router = inject(Router);
  readonly steps = [{ id: 'delivery', label: 'Delivery' }, { id: 'payment', label: 'Payment' }, { id: 'review', label: 'Review' }];
  readonly step = signal<CheckoutStep>('delivery');
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly feedback = signal('');
  readonly addressFeedback = signal('');
  readonly options = signal<CheckoutOptions | null>(null);
  readonly savedAddresses = signal<SavedAddress[]>([]);
  readonly defaultAddressId = signal<string | null>(null);
  readonly selectedAddressId = signal<string | null>(null);
  readonly paymentMethod = signal<PaymentMethod>('cash_on_delivery');
  readonly selectedPayment = computed(() => this.options()?.paymentMethods.find((method) => method.id === this.paymentMethod()));
  readonly placedOrder = signal<Order | null>(null);
  readonly reviewedItems = signal<CartItem[]>([]);
  readonly subtotal = computed(() => (this.step() === 'review' ? this.reviewedItems() : this.cart.items())
    .reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100);
  readonly total = computed(() => (Math.round(this.subtotal() * 100) + Math.round((this.options()?.deliveryFee ?? 0) * 100)) / 100);
  customer: OrderCustomer = { name: '', email: '', phone: '', address: '' };
  shipping = blankAddress();
  deliveryNotes = '';
  saveAddress = true;
  addressLabel = 'Home';
  accepted = false;
  private userId: string | undefined;
  private revision = 0;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user?.id === this.userId) return;
      this.userId = user?.id;
      this.revision++;
      this.step.set('delivery'); this.placedOrder.set(null); this.feedback.set(''); this.addressFeedback.set('');
      this.shipping = blankAddress(); this.deliveryNotes = ''; this.accepted = false;
      this.selectedAddressId.set(null); this.saveAddress = true; this.addressLabel = 'Home';
      const saved = user ? this.preferences.load(user.id) : { addresses: [], defaultAddressId: null, paymentMethod: 'cash_on_delivery' as PaymentMethod };
      this.savedAddresses.set(saved.addresses); this.defaultAddressId.set(saved.defaultAddressId); this.paymentMethod.set(saved.paymentMethod);
      const displayName = user?.user_metadata?.['display_name'];
      this.customer = { name: typeof displayName === 'string' ? displayName : '', email: user?.email ?? '', phone: '', address: '' };
      const selected = saved.addresses.find((address) => address.id === saved.defaultAddressId) ?? saved.addresses[0];
      if (selected) this.useAddress(selected);
      if (user) void this.loadOptions();
      else { this.options.set(null); this.loading.set(false); }
    });
    addIcons({ checkmarkCircleOutline });
  }

  ionViewWillEnter(): void {
    if (this.step() === 'confirmation' && this.cart.items().length) { this.step.set('delivery'); this.placedOrder.set(null); this.accepted = false; }
    if (!this.cart.items().length && this.step() !== 'confirmation') { void this.router.navigate(['/cart']); return; }
    void this.loadOptions();
  }

  async loadOptions(): Promise<void> {
    const revision = ++this.revision;
    this.loading.set(true); this.feedback.set(''); this.options.set(null); this.accepted = false;
    try {
      const options = await this.orders.checkoutOptions();
      if (revision !== this.revision) return;
      this.options.set(options);
      if (!options.paymentMethods.some((method) => method.id === this.paymentMethod() && method.enabled)) this.paymentMethod.set('cash_on_delivery');
    } catch (error) { if (revision === this.revision) this.feedback.set(apiErrorMessage(error)); }
    finally { if (revision === this.revision) this.loading.set(false); }
  }

  useAddress(address: SavedAddress): void {
    this.selectedAddressId.set(address.id);
    this.customer = { name: address.name, email: address.email, phone: address.phone, address: address.address };
    this.shipping = address.shippingAddress ? { ...address.shippingAddress } : { ...blankAddress(), line1: address.address };
    this.addressLabel = address.label; this.addressFeedback.set('');
  }

  newAddress(): void {
    this.selectedAddressId.set(null); this.shipping = blankAddress(); this.customer.address = ''; this.addressLabel = 'Home'; this.addressFeedback.set('');
  }

  removeAddress(address: SavedAddress): void {
    this.savedAddresses.update((addresses) => addresses.filter((item) => item.id !== address.id));
    if (this.defaultAddressId() === address.id) this.defaultAddressId.set(this.savedAddresses()[0]?.id ?? null);
    if (this.selectedAddressId() === address.id) this.selectedAddressId.set(null);
    this.persistPreferences();
  }

  makeDefault(address: SavedAddress): void { this.defaultAddressId.set(address.id); this.persistPreferences(); }

  continueToPayment(form: NgForm): void {
    form.form.markAllAsTouched();
    this.addressFeedback.set('');
    this.customer = { name: this.customer.name.trim(), email: this.customer.email.trim(), phone: this.customer.phone.trim(), address: '' };
    this.shipping = { ...this.shipping, line1: this.shipping.line1.trim(), line2: this.shipping.line2.trim(), barangay: this.shipping.barangay.trim(),
      city: this.shipping.city.trim(), province: this.shipping.province.trim(), postalCode: this.shipping.postalCode.trim() };
    this.customer.address = formatAddress(this.shipping);
    if (form.invalid || !this.validDelivery()) { this.addressFeedback.set('Check the required fields, email, contact number, and four-digit postal code.'); return; }
    if (this.saveAddress) {
      if (!this.selectedAddressId() && this.savedAddresses().length >= 5) {
        this.addressFeedback.set('You have five saved addresses. Remove one or turn off “Save address” to continue.'); return;
      }
      const id = this.selectedAddressId() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const address: SavedAddress = { id, label: this.addressLabel.trim() || 'Home', ...this.customer, shippingAddress: { ...this.shipping } };
      this.savedAddresses.update((addresses) => [...addresses.filter((item) => item.id !== id), address]);
      this.selectedAddressId.set(id);
      if (!this.defaultAddressId()) this.defaultAddressId.set(id);
      this.persistPreferences();
    }
    this.feedback.set(''); this.accepted = false; this.step.set('payment');
  }

  continueToReview(): void {
    if (!this.options() || !this.selectedPayment()?.enabled || !this.validDelivery()) return;
    this.reviewedItems.set(this.cart.items().map((item) => ({ ...item })));
    this.accepted = false; this.feedback.set(''); this.step.set('review');
  }

  async refreshCart(): Promise<void> {
    this.loading.set(true);
    const refreshed = await this.products.refresh();
    if (refreshed) {
      this.cart.refreshProducts(this.products.products().map((product) => ({ id: product.id, name: product.name, price: priceValue(product), image: product.photo ?? 'assets/Products/AlmondBliss.webp' })));
      this.reviewedItems.set(this.cart.items().map((item) => ({ ...item })));
    }
    this.loading.set(false); this.accepted = false;
    await this.loadOptions();
    if (this.options()) this.feedback.set(refreshed ? 'Cart prices refreshed. Review your quantities and total before placing the order.' : this.products.error());
  }

  async placeOrder(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (this.busy() || this.loading() || this.step() !== 'review' || !this.accepted || !userId || !this.options() || !this.selectedPayment()?.enabled) return;
    if (!this.validDelivery()) { this.step.set('delivery'); this.addressFeedback.set('Check your delivery details.'); return; }
    if (JSON.stringify(this.cart.items()) !== JSON.stringify(this.reviewedItems())) {
      this.reviewedItems.set(this.cart.items().map((item) => ({ ...item })));
      this.accepted = false; this.feedback.set('Your cart changed. Review the updated items and total.'); return;
    }
    const purchased = this.reviewedItems().map((item) => ({ ...item }));
    if (!purchased.length) { void this.router.navigate(['/cart']); return; }
    this.busy.set(true); this.feedback.set('');
    try {
      const order = await this.orders.place({ ...this.customer }, purchased, {
        paymentMethod: this.paymentMethod(), shippingAddress: { ...this.shipping }, deliveryNotes: this.deliveryNotes.trim(), deliveryFee: this.options()!.deliveryFee,
      });
      if (userId !== this.auth.user()?.id) return;
      this.cart.completeCheckout(purchased);
      this.persistPreferences(); this.placedOrder.set(order); this.step.set('confirmation');
    } catch (error) { if (userId === this.auth.user()?.id) this.feedback.set(apiErrorMessage(error)); }
    finally { this.busy.set(false); }
  }

  paymentLabel(method: PaymentMethod | null | undefined = this.paymentMethod()): string { return method ? PAYMENT_LABELS[method] : 'Not recorded'; }
  addressSummary(): string { return formatAddress(this.shipping); }
  stepIndex(): number { return this.steps.findIndex((item) => item.id === this.step()); }

  private validDelivery(): boolean {
    return Boolean(this.customer.name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.customer.email) &&
      /^[+\d\s().-]{7,30}$/.test(this.customer.phone) && this.customer.phone.replace(/\D/g, '').length >= 7 &&
      this.shipping.line1 && this.shipping.barangay && this.shipping.city && this.shipping.province && /^\d{4}$/.test(this.shipping.postalCode) &&
      this.customer.address.length <= 500);
  }

  private persistPreferences(): void {
    const userId = this.auth.user()?.id;
    if (userId) this.preferences.save(userId, { addresses: this.savedAddresses(), defaultAddressId: this.defaultAddressId(), paymentMethod: this.paymentMethod() });
  }
}
