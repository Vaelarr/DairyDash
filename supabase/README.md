# Connect DairyDash to Supabase

The app connects through its Express API. Supabase Postgres stores products and reviews, and Supabase Storage serves product images. The server secret stays in `.env`; Angular and the native app receive product data and public image URLs from the API.

## 1. Create your project

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and sign in or create an account.
2. Create a new project named **DairyDash**, choose your organization and region, and set a database password.
3. Wait for the project to finish provisioning.
4. Open the project's **Connect** dialog to find its project URL. Open **Settings > API Keys** to create/copy a **secret key** (`sb_secret_...`). The backend also supports the legacy `service_role` key.

This integration uses a server key because database/storage writes run inside Express. A publishable/anon key will not work with these server-only table permissions. See [Supabase's key guide](https://supabase.com/docs/guides/getting-started/api-keys).

## 2. Set up the database and Storage bucket

Open **SQL Editor** in the new project, create a query, paste the entire contents of [202610070001_dairydash.sql](migrations/202610070001_dairydash.sql), and run it.

Then run [202610080001_orders.sql](migrations/202610080001_orders.sql) to add orders, order items, and transactional checkout functions. If your project already has the catalog migration, run only this new migration. It preserves existing records and can be rerun.

Finally run [202610090001_review_order_crud.sql](migrations/202610090001_review_order_crud.sql) for review ownership, edit/delete, order delivery/status updates, stock restoration, and deletion. Apply migrations in filename order. Each migration preserves existing records.

The migration creates:

- `dairydash_products` for products, prices in centavos, stock and cloud image references.
- `dairydash_reviews` with a foreign key that deletes reviews when their product is deleted.
- `dairydash_settings` to track the one-time catalog seed.
- The `dairydash-product-images` public Storage bucket, limited to PNG, JPEG and WebP files up to 5 MB.
- Search and seed RPC functions, price/stock/review constraints, an update timestamp trigger, and row-level security.

Anonymous and signed-in Supabase clients have no access to these tables or RPCs. Only the API's server role can use them. Product images are public because they appear in the catalog; uploads/deletions go through the API. No public upload policy is created. The script can be rerun without deleting records or reseeding.

## 3. Configure the local API

Fill in `.env` at the project root (it is ignored by Git). If it does not exist, copy `.env.example` first:

```powershell
Copy-Item .env.example .env
```

Set these values:

```dotenv
DATABASE_PROVIDER=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_STORAGE_BUCKET=dairydash-product-images
```

Keep the server key in this file or your hosting provider's server environment. Do not place it in `src/environments`, browser code, a mobile build, or Git. The normal frontend API URL remains `/api` for browser development.

## 4. Upload the catalog and start the app

From the project root:

```sh
npm install
npm run db:seed
npm run db:check
npm run dev
```

`db:seed` uploads the original 30 product images to Storage and inserts their products with stable IDs. It runs once per project; repeating it preserves edits and deletions. It requires the SQL migration and valid credentials first. If a seed is interrupted before the database commit, unused uploads are cleaned up where their ownership can be verified; rerunning the seed is safe.

Visit `http://localhost:3000`. To verify the cloud services, open `http://127.0.0.1:3001/api/health`; it should return `{"status":"ok"}`. The API startup message shows `(supabase)`. Confirm products in Supabase's Table Editor and photos in **Storage > dairydash-product-images**. Add a product with an image in the app, then open it from another browser or phone using the same API.

## Existing local data and mobile builds

Choosing Supabase leaves any SQLite database and browser localStorage intact. This setup seeds the original catalog into the new cloud project; it does not automatically import older local custom products or reviews. Import those deliberately if you have records to preserve.

A packaged Capacitor app needs an absolute HTTPS **Express API URL** in `src/environments/environment.ts`. Deploy the API with its Supabase environment variables, and add the website/native origins to `CORS_ORIGINS`. Supabase hosts the database and images; this change does not deploy the Express API or website.

The Angular app now uses the project's publishable key for Supabase Auth. Express verifies user access tokens: catalog writes require a trusted admin role, reviews require sign-in, and checkout/order history belong to the signed-in customer. RLS still prevents browser access to the private tables and RPCs. See [the account and order setup guide](../server/README.md#accounts-and-orders-setup) for email confirmation, admin assignment, checkout rules, and remaining scope.

Customer accounts already persist in the project's `auth.users` table; no separate account migration is required. `npm run db:check` also verifies server access to this account database. Complete [the email/password configuration](../server/README.md#account-creation-email-and-password-handling), including confirmation, a provider password minimum of 12, and the `/account` confirmation/recovery redirect URLs. The app's **Account connected** indicator verifies the current saved account through the authenticated API.

For confirmation and password recovery delivery, follow [the Brevo SMTP setup guide](brevo-smtp.md). It replaces Supabase's built-in email service through custom SMTP while keeping the existing account system.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Supabase is not configured` | Fill in `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`, then restart the API |
| Key validation rejects a publishable/anon key | Use the server secret key from Settings > API Keys |
| Cloud database/storage unavailable | Verify the project is active, the key belongs to that project, and the complete SQL migration ran |
| Product image bucket must be public | Check the `dairydash-product-images` bucket's public setting |
| Catalog is empty | Run `npm run db:seed`; repeating it after deleting products intentionally does not restore them |
| Checkout/order history reports cloud unavailable | Run the new order migration, then `npm run db:check` |
| Review edit/delete or order management reports cloud unavailable | Apply `202610090001_review_order_crud.sql`, then run `npm run db:check` |
| Product management returns 403 | Assign `app_metadata.role = 'admin'` to the trusted user and sign in again |
| Browser cannot reach API | Ensure `npm run dev` started both services and the proxy points to the API port |

For offline development, explicitly set `DATABASE_PROVIDER=sqlite`; its old local database implementation remains available. Supabase mode never silently saves to SQLite when cloud configuration or network access fails.

Run `npm run test:api` for SQLite route tests and Supabase adapter tests. The Supabase tests run the real SQL migration in a local PostgreSQL-compatible engine and exercise the real JavaScript SDK through a test HTTP transport. They check permissions, cloud image lifecycle, conflicts, failure recovery, pagination, and reviews without contacting your project. A live project check is still needed after you configure your new project.
