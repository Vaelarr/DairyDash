export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface Order {
  id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
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
