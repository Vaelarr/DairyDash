# DairyDash backend

The Angular/Ionic website and native app share an Express REST API. Supabase Postgres stores products and product reviews, and Supabase Storage hosts product images. Prices are stored as integer centavos and returned as numbers in Philippine pesos. Angular formats them for display. SQLite is available as an explicit offline development option.

## Run locally

Use Node.js **24 or newer**. First complete [the Supabase setup guide](../supabase/README.md): create a project, run the SQL migration, and fill in `.env`. Node strips the types from the shared TypeScript catalog and category files, so a server compilation step is unnecessary.

```sh
npm install
npm run db:seed
npm run dev
```

- Website: `http://localhost:3000`
- API health: `http://127.0.0.1:3001/api/health`
- Database: Supabase Postgres (`dairydash_products`, `dairydash_reviews`)
- Product images: Supabase Storage (`dairydash-product-images` bucket)

The SQL migration creates the cloud schema and bucket. `npm run db:seed` uploads all 30 original product photos and inserts the catalog with stable IDs. A database marker and transaction prevent repeated seeds from restoring deleted products. An empty catalog stays empty after seeding. Reviews are deleted automatically when their product is deleted.

Use `npm run api:dev` and `npm run dev:web` in separate terminals if preferred. `npm run api` starts the API without watching files. `npm run test:api` runs tests with isolated SQLite/Postgres engines and a test Supabase HTTP transport; it does not contact your cloud project. `npm run build` verifies and builds the Angular application.

## Configuration

Copy `.env.example` to `.env` and configure your Supabase values. The API loads it automatically. Supabase is the default provider; missing credentials and cloud failures do not silently fall back to local storage.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PROVIDER` | `supabase` | `supabase` for cloud storage or `sqlite` for explicit offline development |
| `SUPABASE_URL` | Required | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Required | Server-only secret key; legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported |
| `SUPABASE_STORAGE_BUCKET` | `dairydash-product-images` | Public catalog image bucket created by the migration |
| `API_PORT` | `3001` | API listener port |
| `API_HOST` | `127.0.0.1` | Listener interface |
| `DATABASE_PATH` | `server/data/dairydash.sqlite` | Optional SQLite provider's file, relative to the project root or absolute |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed application origins |

The Angular development server uses `proxy.conf.json` to forward `/api/**` to port 3001. If you change the API port, update that proxy target too. If you change the website port or access it from a phone at a LAN address, add that exact browser origin (for example `http://192.168.1.20:3000`) to `CORS_ORIGINS`. The proxy lets the API keep its loopback listener when accessing the website from a phone.

`src/environments/environment.ts` sets the client's API URL. Browser development uses `/api`. A separately hosted website needs a reverse proxy for `/api` or an absolute API URL. A bundled Capacitor build needs an **absolute HTTPS API URL** because Angular's development proxy is not included in the native app. Add the actual native origin, such as `capacitor://localhost` or `http://localhost`, to `CORS_ORIGINS`. For direct LAN API testing, bind `API_HOST=0.0.0.0` and use your computer's LAN IP; a phone's `localhost` refers to the phone.

The production web build does not start or bundle the API. Deploy the API separately with its server-only Supabase configuration. No local database volume is required in Supabase mode. If using SQLite instead, retain its database on persistent storage and stop the API before copying it for backups.

## API

Successful record/list responses use `{ "data": ... }`. Errors use `{ "error": { "message": "...", "fields": { ... } } }`; `fields` is present for validation errors. Write requests require `Content-Type: application/json`.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Database connectivity check (`{ "status": "ok" }`) |
| GET | `/api/categories` | Supported category names |
| GET | `/api/products` | Catalog, newest custom products first, followed by original catalog order |
| GET | `/api/products?q=milk&category=Fresh%20Milk` | Search names/descriptions and filter by category |
| GET | `/api/products?featured=true` | First nine remaining original catalog products |
| GET | `/api/products/:id` | One product, or 404 |
| POST | `/api/products` | Create a product (201, generated UUID ID and Location header) |
| PUT | `/api/products/:id` | Replace editable product fields; ID and catalog order stay stable |
| DELETE | `/api/products/:id` | Delete the product and reviews (204) |
| GET | `/api/products/:id/reviews` | Product reviews, newest first |
| POST | `/api/products/:id/reviews` | Create a review (201, server-generated ID/timestamp) |

Example product request:

```json
{
  "name": "Fresh milk",
  "category": "Fresh Milk",
  "price": 149.50,
  "stock": 12,
  "description": "Fresh bottled milk"
}
```

The name is required, up to 60 characters; description is up to 200 characters. Category must match `/api/categories`. Existing seeded records without categories can still be edited with an empty category. Prices range from 0.01 to 999,999.99 with at most two decimal places. Stock is an optional whole number from 0 to 1,000,000,000; absent/null means not set. `PUT` clears omitted optional stock/photo values.

Optional `photo` accepts the existing `assets/Products/...` paths, HTTPS image URLs, or base64 PNG/JPEG/WebP data URLs with validated signatures and a maximum decoded size of 5 MB. In Supabase mode, uploads go to Storage and the product stores the HTTPS public URL and an internal ownership path. Editing the existing cloud image does not reupload it; replacing/deleting it cleans up its owned object after the database write succeeds. Cleanup failures leave an unused object and a server warning rather than reporting a failed save. The form resizes PNG/JPEG uploads to at most 800 pixels. The JSON body limit is 7 MB to allow base64 overhead. Unsupported formats, malformed data URLs, and invalid signatures return validation errors. SQLite mode continues storing inline image data locally.

Example review request:

```json
{ "name": "Ana", "rating": 5, "comment": "Very fresh." }
```

Reviews require a name (up to 60 characters), an integer rating from 1 to 5, and a comment (up to 500 characters). Search uses a parameterized Postgres function with literal substring matching, and lists fetch in pages to avoid Supabase's default response cap. Cloud operations return 503 when unavailable and 409 if a simultaneous edit prevents a safe save/delete. Internal database diagnostics are not returned to clients.

## Current scope

This first backend implementation covers the existing catalog management and review flows. Cart and wishlist controls still have their existing presentation behavior; accounts, authentication, admin permissions, checkout, orders, payments, review moderation, and automatic real-time updates are future work. Clients refresh the catalog when visiting a catalog page and refresh product details/reviews when reopening a product.

The API defaults to local development. Product writes and reviews currently have no authentication; add identity, authorization, and abuse controls before exposing it as a public service. CORS is an origin policy, not an authentication mechanism.

Existing browser-only products, edits, hidden products, and reviews remain in localStorage but are not automatically imported into the shared database. The app now reads the API's catalog and reviews. This avoids treating one browser's private edits as changes for every user; a deliberate migration can be added if that data is needed.

The Supabase migration lives in `supabase/migrations`. Add forward migrations for future cloud schema changes. The optional SQLite schema version uses `PRAGMA user_version`. Existing local SQLite/browser records are preserved and are not automatically imported into the new Supabase project.

Implementation references: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Storage uploads](https://supabase.com/docs/reference/javascript/storage-from-upload), [Express API](https://expressjs.com/en/5x/api/), and [Angular HttpClient](https://angular.dev/guide/http/setup).
