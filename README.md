# MilkSwift - Dairy Products Catalog & Dashboard

MilkSwift is a cross-platform mobile and web application built using **Angular 22** standalone components, **Ionic Framework 9**, and **Capacitor 8**. It features a modern dairy product catalog with real-time filtering, interactive hero promotional banners, developer team profiles, and responsive mobile-first navigation with split-pane support for desktop and tablet screens.

---

## Tech Stack & Architecture

- **Framework**: [Angular 22](https://angular.dev/) (Standalone Components, modern `@angular/build` pipeline)
- **UI Components**: [Ionic Framework 9](https://ionicframework.com/) (`@ionic/angular` standalone components, Ionicons 8)
- **Mobile Runtime**: [Capacitor 8](https://capacitorjs.com/) (iOS & Android native deployment)
- **Language**: [TypeScript 6](https://www.typescriptlang.org/)
- **Reactive Programming**: [RxJS 7.8](https://rxjs.dev/)
- **Styling**: Ionic CSS utilities, custom CSS variables, and modern responsive typography (Nunito & Fredoka fonts)

---

## Prerequisites

Before setting up the project, ensure you have the following installed on your machine:

1. **Node.js**: `v20.x`, `v22.x`, or `v24.x` (LTS or Current)
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

### Option A: Standard npm Scripts (Recommended)

```bash
npm run dev
# or
npm start
```
- Starts the development server at **`http://localhost:3000/`**.
- Configured to bind to `0.0.0.0`, allowing testing from mobile devices on the same local network.
- Live-reloads automatically when source files change.

### Option B: Angular CLI

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
| `npm run dev` | `ng serve --host 0.0.0.0 --port 3000` | Starts development server on port 3000 |
| `npm start` | `ng serve --host 0.0.0.0 --port 3000` | Alias for `npm run dev` |
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
