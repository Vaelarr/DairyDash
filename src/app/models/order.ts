import { OrderStatus, PaymentMethod, PaymentStatus, ShippingAddress } from './checkout';

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  payment: { method: PaymentMethod | null; status: PaymentStatus; instructions: string };
  delivery: { address: ShippingAddress | null; notes: string };
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: OrderCustomer;
  items: {
    productId: string | null;
    name: string;
    price: number;
    quantity: number;
    total: number;
  }[];
}
