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

The production web build does not start the API. Vercel runs it through the serverless entrypoint described below; other hosts need a separately running API with its server-only Supabase configuration. No local database volume is required in Supabase mode. If using SQLite instead, retain its database on persistent storage and stop the API before copying it for backups.

## Deploy on Vercel

Import the repository with the repository root as the project root. The checked-in `vercel.json` builds Angular into `www`, routes `/api/**` to `api/index.js`, and serves Angular's `index.html` for page routes such as `/dashboard`. The function reuses the Express routes and Supabase connection without starting a local listener. Keep the frontend `apiUrl` as `/api`.

In **Settings > Environment Variables**, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` for Production (and Preview if you use preview deployments). Use the same values as your local `.env`. Optionally set `SUPABASE_STORAGE_BUCKET` for a different bucket and `CORS_ORIGINS` for additional application origins. The API includes the production and preview origins supplied by Vercel automatically. Local `.env` files stay out of Git and are not copied to Vercel.

Use Node.js 24 or newer. Supabase migrations and the catalog seed need to run only once for the shared project; do not run the seed during every deployment. Vercel always uses Supabase with verified account permissions, even if a local SQLite setting was copied into the deployment environment.

After setting environment variables, redeploy. Verify `/api/health` returns JSON with `status: "ok"` and `/api/products` returns JSON containing the catalog. If an API URL returns HTML, check that the deployment includes `vercel.json` and `api/index.js` and that the project root is correct. A JSON 503 configuration error means the server environment variables still need to be set.

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
| GET | `/api/products/:id/reviews/:reviewId` | Read one review, or 404 |
| PUT | `/api/products/:id/reviews/:reviewId` | Author/admin replaces name, rating and comment using the latest `updatedAt` |
| DELETE | `/api/products/:id/reviews/:reviewId` | Author/admin deletes a review using `If-Match` (204) |
| GET | `/api/account` | Verified signed-in user and admin flag |
| POST | `/api/orders` | Save a signed-in customer's order and decrement stock in one transaction |
| GET | `/api/orders` | Signed-in customer's order history |
| GET | `/api/orders/:id` | Customer's own order, or 404 |
| PUT | `/api/orders/:id` | Customer edits pending delivery details or cancels a pending order |
| DELETE | `/api/orders/:id` | Customer deletes a pending/cancelled order from history (204) |
| GET | `/api/admin/orders` | Admin lists all active customer orders |
| GET | `/api/admin/orders/:id` | Admin reads any active order |
| PUT | `/api/admin/orders/:id` | Admin edits delivery details or progresses/cancels an order |
| DELETE | `/api/admin/orders/:id` | Admin deletes any order from history (204) |

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

The backend covers product/review/order CRUD, Supabase email/password accounts, admin permissions, checkout, order history, review moderation, and order status management. The cart stays in browser storage; product-details buttons add the selected quantity. Checkout collects delivery details, saves a pending order, and clears purchased quantities only after confirmation from the API. Payments, wishlist persistence, delivery integrations, and automatic real-time updates remain future work. Clients refresh the catalog when visiting a catalog page and refresh product details/reviews when reopening a product.

In Supabase mode, catalog reads remain public. Product create/update/delete require a verified Supabase access token and `app_metadata.role = 'admin'`. New reviews require sign-in. Accounts and orders always require a verified token. Express verifies the token through Supabase Auth and takes the order owner from that verified identity; client-supplied ownership fields are ignored. User-editable `user_metadata` cannot grant admin access. The optional SQLite development provider retains unauthenticated catalog editing and does not configure account verification, so checkout requires Supabase mode. CORS is an origin policy, not an authentication mechanism. Abuse controls are still needed for a public production deployment.

## Accounts and orders setup

Apply [202610080001_orders.sql](../supabase/migrations/202610080001_orders.sql) after the original migration, followed by [202610090001_review_order_crud.sql](../supabase/migrations/202610090001_review_order_crud.sql), then run `npm run db:check`. The check reads cloud configuration without creating users or changing records. The frontend publishable key lives in `src/environments/environment.ts`; the server secret stays in ignored `.env`. The frontend sends the user's access token only to its configured Express API. Supabase tables and order RPCs remain restricted to the server role.

Open `/account` to create an account or sign in. Supabase email confirmation is supported: users confirm their email before signing in if enabled in the project. Enable the Email provider in Supabase Auth and configure its Site URL and allowed redirect URLs for your deployment. For local browser development, use `http://localhost:3000`.

To grant a trusted user catalog admin access, find their UUID in Supabase **Authentication > Users**, then run this in the SQL Editor with the actual UUID. Sign out and back in to refresh their session after changing the role:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = 'REPLACE_WITH_USER_UUID'::uuid;
```

An order request includes a UUID `requestId`, `customer` (`name`, `email`, `phone`, `address`), and 1–50 unique `items` (`productId`, `quantity`, `price`). Quantities are whole numbers from 1–99; `price` is the unit price the customer reviewed. The server compares displayed prices with current database prices and computes all totals from database centavos. A price change, missing product, or insufficient stock returns 409 without saving an order or changing any stock. Unknown/null stock stays untracked. Row locks and a transaction protect stock during simultaneous checkouts.

Retries with the same request ID and normalized body return the original order without consuming stock again. Reusing that ID with different details returns 409. The client retains retry IDs across connection failures and reloads in browser storage, and preserves the cart on failure. Customer order history is private, including the individual order endpoint. Order lines retain names/prices after catalog edits and product deletion. Orders start as `pending`; no payment is collected by this implementation.

## Editing and deleting reviews/orders

New reviews record the verified author's ID. Authors and admins can edit/delete them from product details; older reviews with no recorded author can only be moderated by admins. Ownership cannot be changed by a request body.

Customers edit delivery/contact details on `/orders` while an order is pending. Admins use `/manage-orders` to edit pending/confirmed deliveries and change status: `pending → confirmed → completed`, or `pending/confirmed → cancelled`. Completed/cancelled orders cannot be reopened. Product lines and charged prices remain immutable; cancel and place a new order to change products or quantities. Customer routes remain private even for admins; cross-customer management uses the separate admin routes.

Review/order responses include `updatedAt`. Every update supplies that exact value in its JSON body. Every delete supplies `If-Match: "<updatedAt>"`. Missing versions return 400; stale versions return 409. The frontend reloads after conflicts so a stale save cannot overwrite another user's changes.

Cancelling or deleting a pending/confirmed order restores its recorded finite-stock reservation in the same transaction. Deleting an already cancelled order never restores it twice, and deleting a completed order leaves consumed stock unchanged. Deletion hides the order from customer/admin reads while retaining its checkout ID internally, so an old checkout retry returns 409 rather than creating the order again. Missing/deleted products keep their historical item snapshots and are not recreated.

Legacy orders predate the stock reservation flag. The migration leaves `stock_deducted` NULL for those lines rather than guessing whether stock was tracked at checkout. Before cancelling/deleting such an active order, verify each original reservation and set its line's `stock_deducted` to `true` if stock was deducted, or `false` if it was untracked, in Supabase's Table Editor. Unknown reservations and restoration beyond the stock limit return 409 without partially changing the order or inventory. New checkouts record this automatically.

Existing browser-only products, edits, hidden products, and reviews remain in localStorage but are not automatically imported into the shared database. The app now reads the API's catalog and reviews. This avoids treating one browser's private edits as changes for every user; a deliberate migration can be added if that data is needed.

The Supabase migration lives in `supabase/migrations`. Add forward migrations for future cloud schema changes. The optional SQLite schema version uses `PRAGMA user_version`. Existing local SQLite/browser records are preserved and are not automatically imported into the new Supabase project.

Implementation references: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Storage uploads](https://supabase.com/docs/reference/javascript/storage-from-upload), [Express API](https://expressjs.com/en/5x/api/), and [Angular HttpClient](https://angular.dev/guide/http/setup).
