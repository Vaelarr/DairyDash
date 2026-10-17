/** Persisted Supabase Auth account, read through the verified Express API. */
export interface Account {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: string | null;
  isAdmin: boolean;
}
