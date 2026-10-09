# MilkSwift - Dairy Products Catalog & Dashboard

MilkSwift is a cross-platform mobile and web application built using **Angular 22** standalone components, **Ionic Framework 9**, and **Capacitor 8**. It features a modern dairy product catalog with real-time filtering, interactive hero promotional banners, developer team profiles, and responsive mobile-first navigation with split-pane support for desktop and tablet screens.

Products and reviews use an **Express API with Supabase Postgres**, and product images use **Supabase Storage**. Follow [the Supabase setup guide](supabase/README.md) to create your project, run the SQL migration, configure `.env`, and upload the catalog. Then run `npm run dev` for the website at `http://localhost:3000` and API at `http://127.0.0.1:3001/api`. See [the backend guide](server/README.md) for API routes and mobile connections. SQLite remains an explicit offline development option.

Supabase Auth supports email/password accounts. Products, reviews and orders have create/read/update/delete flows with author/customer/admin permissions. Customers edit pending deliveries and cancel/delete orders; admins manage fulfillment from `/manage-orders`. Checkout verifies prices and stock in a transaction, and cancellation releases reserved stock once. For an existing project, apply [the order migration](supabase/migrations/202610080001_orders.sql), then [the review/order CRUD migration](supabase/migrations/202610090001_review_order_crud.sql), run `npm run db:check`, and follow [account/admin setup](server/README.md#accounts-and-orders-setup).

---

## Tech Stack & Architecture

- **Framework**: [Angular 22](https://angular.dev/) (Standalone Components, modern `@angular/build` pipeline)
- **UI Components**: [Ionic Framework 9](https://ionicframework.com/) (`@ionic/angular` standalone components, Ionicons 8)
- **Mobile Runtime**: [Capacitor 8](https://capacitorjs.com/) (iOS & Android native deployment)
- **Language**: [TypeScript 6](https://www.typescriptlang.org/)
- **Reactive Programming**: [RxJS 7.8](https://rxjs.dev/)
- **Styling**: Ionic CSS utilities, custom CSS variables, and modern responsive typography (Nunito & Fredoka fonts)
- **Backend**: Express 5, Node.js 24+, Supabase Postgres and Storage (optional local SQLite)

---

## Prerequisites

Before setting up the project, ensure you have the following installed on your machine:

1. **Node.js**: `v24.x` or newer (required for shared TypeScript seed imports and optional SQLite)
   - Verify: `node -v`
2. **npm**: `v10.x` or `v11.x`
   - Verify: `npm -v`
3. *(Optional)* **Global CLIs**:
   You can run commands via `npx`, or install the CLIs globally for convenience:
   ```bash
   npm install -g @angular/cli @ionic/cli
   ```

---

## Development Environment Setup

### 1. Open the Project Directory

Open your terminal in the project repository root:

```bash
# Ensure you are in the project root directory
npm install
```

### 2. Install Dependencies

Install all required Angular, Ionic, and Capacitor packages:

```bash
npm install
```

---

## Running the Application Locally

You can launch the development server using any of the following approaches:

Configure your Supabase project first using [supabase/README.md](supabase/README.md). For offline development, set `DATABASE_PROVIDER=sqlite` in `.env`.

### Option A: Standard npm Scripts (Recommended)

```bash
npm run dev
# or
npm start
```
- Starts the website at **`http://localhost:3000/`** and the API at **`http://127.0.0.1:3001/api`**.
- Proxies browser requests from `/api` to the API, which saves products/reviews in Supabase and uploads images to Storage.
- Configured to bind to `0.0.0.0`, allowing testing from mobile devices on the same local network.
- Live-reloads automatically when source files change.

### Option B: Angular CLI

Start `npm run api:dev` in a second terminal when using Angular or Ionic CLI directly.

```bash
# Using npx (no global install needed):
npx ng serve --port 3000

# Or with global Angular CLI:
ng serve --port 3000
```

### Option C: Ionic CLI

```bash
# Using npx:
npx @ionic/cli serve

# Or with global Ionic CLI:
ionic serve
```

> **Tip:** You can use Ionic Lab to preview iOS and Android layouts side-by-side in your browser:
> ```bash
> npx @ionic/cli serve --lab
> ```

---

## Building for Production

To create an optimized, minified production build:

```bash
npm run build
```
*(Or run `npx ng build` or `npx @ionic/cli build`)*

### Build Output

- The production output is generated in the **`dist/`** directory.
- The build includes:
  - Tree-shaken and code-split JavaScript bundles (`main-*.js`, lazy chunk files).
  - Minified CSS styles (`styles-*.css`).
  - Optimized static assets, manifest, and favicon.
  - Standalone Single Page Application `index.html` entry point.

---

## Mobile & Native Deployment (Capacitor)

MilkSwift is pre-configured with Capacitor for native deployment on iOS and Android.

### Android test build

```sh
npm run mobile:build
```

This builds the web assets, creates the Android project on first use, syncs Capacitor, and assembles a debug APK at `artifacts/DairyDash-debug.apk`. The native bundle stays in `.angular/mobile/browser`, separate from the browser build in `www`. Android uses the live API at `https://dairy-dash.vercel.app/api`; browser builds keep their same-origin `/api` requests. Server secrets remain in the backend.

Install Android Studio and Android SDK 36 first. The build script uses a compatible JDK from `JAVA_HOME`, Java on `PATH`, or Android Studio's bundled runtime on Windows. Use JDK 21 (versions 21–24 are supported by the current Gradle wrapper); an Android Studio runtime using Java 25 or newer needs a separate compatible JDK. Set `ANDROID_HOME` to your SDK location if needed.

Use `npm run mobile:run` to build and run on a connected Android device or emulator, `npm run mobile:open` to open Android Studio, or `npm run mobile:sync` to rebuild and sync the native project without assembling an APK. The debug APK is for testing and is not signed for Play Store release.

For a specific connected device, run `adb devices` and pass its ID, for example `npm run mobile:run -- --target emulator-5554`. To install the APK built by `mobile:build` without rebuilding, run `adb -s emulator-5554 install -r artifacts/DairyDash-debug.apk`. On a physical phone, enable Developer options and USB debugging, connect it by USB, and accept the debugging prompt; use its device ID in place of `emulator-5554`.

### 1. Add Native Platforms

To add Android or iOS native projects (run once):

```bash
# For Android:
npx cap add android

# For iOS (macOS required):
npx cap add ios
```

### 2. Sync Web Assets to Native Projects

Whenever you make changes or build the web app, sync the output to Capacitor:

```bash
# 1. Build web assets
npm run build

# 2. Copy and update native projects
npx cap sync
```

### 3. Open in Native IDEs

```bash
# Open in Android Studio:
npx cap open android

# Open in Xcode:
npx cap open ios
```

### 4. Live Reload on Physical Device or Emulator

You can test changes in real-time on a connected mobile device:

```bash
npx @ionic/cli capacitor run android -l --external
```

---

## Project Structure

```text
IPT4.2Menu/
├── angular.json              # Angular CLI build & workspace configuration
├── ionic.config.json         # Ionic CLI project settings (type: angular)
├── capacitor.config.ts       # Capacitor native app configuration
├── package.json              # Dependencies, devDependencies, and npm scripts
├── tsconfig.json             # TypeScript root compiler configuration
├── tsconfig.app.json         # Application TypeScript configuration
├── public/                   # Public static files (manifest.json, favicon.png)
├── src/
│   ├── index.html            # Angular application HTML template
│   ├── main.ts               # Angular standalone bootstrap & Ionic provider setup
│   ├── styles.css            # Global Ionic and theme stylesheet imports
│   ├── assets/               # Product photos, carousel slides, profiles, fonts
│   │   ├── Carousel/         # Promotional banner images
│   │   ├── Products/         # Product catalog images
│   │   ├── Profiles/         # Developer avatar images
│   │   └── Nunito/, Fredoka/ # Custom font files
│   ├── theme/
│   │   └── variables.css     # Ionic color palettes and theme variables
│   └── app/
│       ├── app.component.ts  # Root standalone component (IonApp, IonSplitPane)
│       ├── app.component.html# Root template rendering menu and ion-router-outlet
│       ├── app.component.css # Root styling
│       ├── app.routes.ts     # Standalone lazy routes definition
│       ├── components/       # Reusable standalone components
│       │   ├── hero-carousel/# Auto-rotating touch-enabled promotional carousel
│       │   ├── menu/         # Side navigation menu with active route tracking
│       │   └── page-layout/  # Consistent page wrapper with toolbar & menu button
│       └── pages/            # Feature pages (lazy-loaded)
│           ├── dashboard/    # Overview page with carousel and featured items
│           ├── products/     # Full product catalog with real-time search
│           ├── about/        # Application and product brand details
│           └── developers/   # Developer credits, roles, and avatar profiles
└── dist/                     # Production build output
```

---

## Available npm Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `node scripts/dev.js` | Starts the Angular website and API together |
| `npm start` | `node scripts/dev.js` | Alias for `npm run dev` |
| `npm run dev:web` | `ng serve --host 0.0.0.0 --port 3000` | Starts only the website |
| `npm run api` | `node --env-file-if-exists=.env server/index.js` | Starts only the API |
| `npm run api:dev` | `node --watch --env-file-if-exists=.env server/index.js` | Starts the API with reloads |
| `npm run test:api` | `node --test server/tests/*.test.js` | Tests API routes and persistence |
| `npm run db:seed` | `node --env-file-if-exists=.env scripts/seed-supabase.js` | Uploads catalog images and seeds Supabase once |
| `npm run build` | `ng build` | Produces production-ready bundles in `dist/` |
| `npm run watch` | `ng build --watch --configuration development` | Builds in watch mode for development |
| `npm run ionic:serve` | `ng serve` | Invoked automatically by Ionic CLI (`ionic serve`) |
| `npm run ionic:build` | `ng build` | Invoked automatically by Ionic CLI (`ionic build`) |

---

## Troubleshooting

### Port 3000 Already in Use
If port 3000 is occupied by another process, specify a custom port:
```bash
npm run dev -- --port 4200
```

### Clearing Build & Dependency Cache
If you encounter caching anomalies after updating dependencies:
```bash
# Windows PowerShell
Remove-Item -Recurse -Force .angular -ErrorAction SilentlyContinue
npm cache clean --force
npm run build
```

### Execution Policy on Windows PowerShell
If scripts are blocked from executing in PowerShell:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
