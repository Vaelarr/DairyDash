import { Routes } from '@angular/router';
import { accountGuard, adminGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.page').then(
        (m) => m.DashboardPage
      ),
  },
  {
    path: 'products',
    loadComponent: () =>
      import('./pages/products/products.page').then(
        (m) => m.ProductsPage
      ),
  },
  {
    path: 'cart',
    loadComponent: () =>
      import('./pages/cart/cart.page').then(
        (m) => m.CartPage
      ),
  },
  {
    path: 'view-product/:id',
    loadComponent: () =>
      import('./pages/product-details/product-details.page').then(
        (m) => m.ProductDetailsPage
      ),
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'orders', canActivate: [accountGuard],
    loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage),
  },
  {
    path: 'manage-orders', canActivate: [adminGuard], data: { admin: true },
    loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage),
  },
  {
    path: 'manage-products',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/manage-products/manage-products.page').then(
        (m) => m.ManageProductsPage
      ),
  },
  {
    path: 'add-product',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/product-form/product-form.page').then(
        (m) => m.ProductFormPage
      ),
  },
  {
    path: 'edit-product/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/product-form/product-form.page').then(
        (m) => m.ProductFormPage
      ),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.page').then(
        (m) => m.AboutPage
      ),
  },
  {
    path: 'company-history',
    loadComponent: () =>
      import('./pages/company-history/company-history.page').then(
        (m) => m.CompanyHistoryPage
      ),
  },
  {
    path: 'developers',
    loadComponent: () =>
      import('./pages/developers/developers.page').then(
        (m) => m.DevelopersPage
      ),
  },

  // Contact Us must come BEFORE the catch-all route.
  {
    path: 'contact-us',
    loadComponent: () =>
      import('./pages/contact-us/contact-us.page').then(
        (m) => m.ContactUsPage
      ),
  },

  // Keep this as the LAST route.
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
