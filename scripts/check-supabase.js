import { createSupabaseClient, supabaseConfig } from '../server/supabase-client.js';
import { openSupabaseDatabase } from '../server/supabase-database.js';
import { environment } from '../src/environments/environment.ts';

try {
  const config = supabaseConfig();
  if (config.projectUrl !== environment.supabaseUrl) throw new Error('Frontend and backend Supabase project URLs must match.');
  const client = createSupabaseClient(config);
  await openSupabaseDatabase(client, { bucket: config.bucket }).healthy();
  console.log('Catalog, reviews and product image bucket: connected.');
  const auth = await fetch(`${config.projectUrl}/auth/v1/settings`, {
    headers: { apikey: environment.supabaseKey }, signal: AbortSignal.timeout(12000),
  });
  if (!auth.ok) throw new Error('The frontend publishable key could not connect to Supabase Auth.');
  const settings = await auth.json();
  if (!settings.external?.email) throw new Error('Enable the Email provider in Supabase Authentication settings.');
  console.log(`Frontend Supabase Auth: connected. Email confirmation: ${settings.mailer_autoconfirm ? 'disabled (enable Confirm email in Supabase)' : 'enabled'}.`);
  const accounts = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (accounts.error) throw new Error('The API server key could not read persisted Supabase Auth accounts.');
  console.log('Account database (auth.users): connected. Passwords are managed by Supabase Auth.');
  for (const table of ['dairydash_orders', 'dairydash_order_items']) {
    const { error } = await client.from(table).select('*').limit(0);
    if (error) throw new Error('Order schema is not ready. Run supabase/migrations/202610080001_orders.sql in the Supabase SQL Editor.');
  }
  const { error } = await client.rpc('dairydash_list_orders', { customer_id: '00000000-0000-0000-0000-000000000000' });
  if (error) throw new Error('Order functions are not ready. Run supabase/migrations/202610080001_orders.sql in the Supabase SQL Editor.');
  console.log('Order schema and checkout functions: ready.');
  const reviewColumns = await client.from('dairydash_reviews').select('user_id,updated_at').limit(0);
  const reservations = await client.from('dairydash_order_items').select('stock_deducted').limit(0);
  const crud = await client.rpc('dairydash_admin_get_order', { order_id: '00000000-0000-0000-0000-000000000000' });
  if (reviewColumns.error || reservations.error || crud.error) {
    throw new Error('Review/order CRUD schema is not ready. Run supabase/migrations/202610090001_review_order_crud.sql in the Supabase SQL Editor.');
  }
  console.log('Review/order CRUD: ready. No cloud data was changed.');
} catch (error) {
  console.error(`Supabase check failed: ${error.message}`);
  process.exitCode = 1;
}
