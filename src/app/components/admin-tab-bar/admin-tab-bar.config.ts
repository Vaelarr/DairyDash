/**
 * The admin area's bottom tab bar, and which routes count as "inside" each tab (for
 * highlighting the active tab, and for deciding when the tab bar itself should show).
 *
 * Kept separate from the component so AppComponent can decide visibility without importing
 * Ionic UI pieces it doesn't otherwise need.
 */
export interface AdminTab {
  label: string;
  icon: string;
  url: string;
  /**
   * Where this tab goes instead, while on one of the unguarded "-preview" routes (so Products,
   * say, doesn't bounce a preview visitor to the real sign-in wall). Pages without a preview
   * build yet (Orders, Settings) omit this and just link to the real, guarded page as normal.
   */
  previewUrl?: string;
  /** Whether `path` (the router URL, no query/hash) belongs to this tab. */
  match: (path: string) => boolean;
}

export const ADMIN_TABS: AdminTab[] = [
  {
    label: 'Dashboard',
    icon: 'grid-outline',
    url: '/admin-dashboard',
    previewUrl: '/admin-dashboard-preview',
    match: (path) => path === '/admin-dashboard' || path === '/admin-dashboard-preview',
  },
  {
    label: 'Products',
    icon: 'cube-outline',
    url: '/manage-products',
    previewUrl: '/manage-products-preview',
    match: (path) =>
      path === '/manage-products' ||
      path === '/manage-products-preview' ||
      path === '/add-product' ||
      path.startsWith('/edit-product/'),
  },
  {
    label: 'Orders',
    icon: 'clipboard-outline',
    url: '/manage-orders',
    match: (path) => path === '/manage-orders',
  },
  {
    label: 'Settings',
    icon: 'settings-outline',
    url: '/account',
    match: (path) => path === '/account',
  },
];

/** True when `path` falls under one of the admin tabs, i.e. the tab bar should be visible. */
export function isAdminTabRoute(path: string): boolean {
  return ADMIN_TABS.some((tab) => tab.match(path));
}

/** True on any of the unguarded "-preview" admin routes (see AdminTab.previewUrl above). */
export function isPreviewAdminRoute(path: string): boolean {
  return path.endsWith('-preview');
}
