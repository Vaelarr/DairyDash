# DairyDash emulator screenshots

Open [index.html](index.html) to browse the captures, or open [user](user/) and [admin](admin/) directly.

Captured October 24, 2026 on the running Pixel 10 Pro Android emulator (emulator-5554), using the app built from the current source. Each PNG is an unmodified 1280 × 2856 Android screenshot.

- User: 45 screenshots, including guest/authentication screens, the signed-in customer account, wishlist, orders, and checkout delivery/payment/review.
- Admin: 19 screenshots, including dashboard, product management, add/edit product, order management, account, and navigation.
- Coverage: 17/17 production route templates. Preview aliases use the same screen templates and are excluded.
- Additional numbered parts show lower sections of long screens. Long catalog/list pages show representative portions.
- The capture uses the light theme. Existing test PNGs in this folder predate this session and are preserved.
- Checkout uses sample delivery fields to reach payment and review. No order was placed; no product, order, or wishlist records were changed.

[manifest.json](manifest.json) records each image's route, capture time (UTC), dimensions, size, and route coverage.

To capture another page while the debug app is running:

```powershell
node scripts/capture-helper.js capture /dashboard screenshots/user/home.png
```
