import { PAYMENT_LABELS } from '../src/app/models/checkout.ts';

export function checkoutOptions(env = {}) {
  const fee = Number(env.CHECKOUT_DELIVERY_FEE ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > 999999.99 || Math.abs(fee * 100 - Math.round(fee * 100)) > 0.000001) {
    throw new Error('CHECKOUT_DELIVERY_FEE must be a nonnegative amount with at most two decimal places.');
  }
  const configured = {
    cash_on_delivery: 'Pay the courier the full order total when your delivery arrives.',
    gcash: env.PAYMENT_GCASH_INSTRUCTIONS?.trim() ?? '',
    maya: env.PAYMENT_MAYA_INSTRUCTIONS?.trim() ?? '',
    bank_transfer: env.PAYMENT_BANK_TRANSFER_INSTRUCTIONS?.trim() ?? '',
  };
  return {
    deliveryFee: fee,
    paymentMethods: Object.entries(PAYMENT_LABELS).map(([id, label]) => ({
      id, label, enabled: Boolean(configured[id]), instructions: configured[id].slice(0, 2000),
    })),
  };
}
