import { Injectable } from '@angular/core';
import { PaymentMethod, ShippingAddress } from '../models/checkout';
export type { PaymentMethod } from '../models/checkout';

export interface SavedAddress {
  id: string;
  label: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  shippingAddress?: ShippingAddress;
}


@Injectable({ providedIn: 'root' })
export class CheckoutPreferencesService {
  private readonly keyPrefix = 'dairyDashCheckoutPreferences:';

  load(userId: string): { addresses: SavedAddress[]; defaultAddressId: string | null; paymentMethod: PaymentMethod } {
    const fallback = { addresses: [], defaultAddressId: null, paymentMethod: 'cash_on_delivery' as PaymentMethod };
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.keyPrefix + userId) ?? 'null');
      if (!value || typeof value !== 'object') return fallback;
      const source = value as Record<string, unknown>;
      const addresses = Array.isArray(source['addresses']) ? source['addresses'].filter(this.isAddress).slice(0, 5) : [];
      const paymentMethod = this.isPaymentMethod(source['paymentMethod']) ? source['paymentMethod'] : fallback.paymentMethod;
      const defaultAddressId = typeof source['defaultAddressId'] === 'string' &&
        addresses.some((address) => address.id === source['defaultAddressId']) ? source['defaultAddressId'] : null;
      return { addresses, defaultAddressId, paymentMethod };
    } catch {
      return fallback;
    }
  }

  save(userId: string, preferences: { addresses: SavedAddress[]; defaultAddressId: string | null; paymentMethod: PaymentMethod }): void {
    try { localStorage.setItem(this.keyPrefix + userId, JSON.stringify(preferences)); } catch { /* Checkout remains usable without storage. */ }
  }

  private isAddress(value: unknown): value is SavedAddress {
    if (!value || typeof value !== 'object') return false;
    const address = value as Record<string, unknown>;
    if (!['id', 'label', 'name', 'email', 'phone', 'address'].every((key) =>
      typeof address[key] === 'string' && (address[key] as string).length > 0 && (address[key] as string).length <= 500)) return false;
    const shipping = address['shippingAddress'];
    if (shipping === undefined) return true;
    if (!shipping || typeof shipping !== 'object') return false;
    const fields = shipping as Record<string, unknown>;
    return fields['country'] === 'PH' && ['line1', 'line2', 'barangay', 'city', 'province', 'postalCode'].every((key) =>
      typeof fields[key] === 'string' && (fields[key] as string).length <= 150);
  }

  private isPaymentMethod(value: unknown): value is PaymentMethod {
    return value === 'cash_on_delivery' || value === 'gcash' || value === 'maya' || value === 'bank_transfer';
  }
}
