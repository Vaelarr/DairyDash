export interface ReviewInput {
  name: string;
  rating: number;
  comment: string;
}

export interface ProductReview extends ReviewInput {
  id: string;
  createdAt: string;
}
