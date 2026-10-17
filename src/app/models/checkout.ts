export type PaymentMethod = 'cash_on_delivery' | 'gcash' | 'maya' | 'bank_transfer';
export type PaymentStatus = 'unpaid' | 'paid' | 'cancelled' | 'refund_pending' | 'refunded';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'completed' | 'cancelled';

export interface ShippingAddress {
  line1: string;
  line2: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  country: 'PH';
}

export interface CheckoutSelection {
  paymentMethod: PaymentMethod;
  shippingAddress: ShippingAddress;
  deliveryNotes: string;
  deliveryFee: number;
}

export interface CheckoutOptions {
  deliveryFee: number;
  paymentMethods: { id: PaymentMethod; label: string; enabled: boolean; instructions: string }[];
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash_on_delivery: 'Cash on delivery', gcash: 'GCash', maya: 'Maya', bank_transfer: 'Bank transfer',
};
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Awaiting payment', paid: 'Paid', cancelled: 'Cancelled', refund_pending: 'Refund pending', refunded: 'Refunded',
};
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Awaiting confirmation', confirmed: 'Confirmed', preparing: 'Preparing',
  out_for_delivery: 'Out for delivery', completed: 'Delivered', cancelled: 'Cancelled',
};
export const ORDER_PROGRESS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'completed'];

export function formatAddress(address: ShippingAddress): string {
  return [address.line1, address.line2, address.barangay, address.city, address.province, address.postalCode, 'Philippines']
    .filter((part) => part.trim()).join(', ');
}
