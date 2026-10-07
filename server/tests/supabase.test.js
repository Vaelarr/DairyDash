import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { supabaseConfig } from '../supabase-client.js';
import { openRepository } from '../repository.js';
import { validateProduct } from '../validation.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=';
const input = (photo = null) => validateProduct({ name: 'Cloud milk', category: 'Fresh Milk', price: 149.5, stock: 12, description: 'Fresh cloud milk', photo });

test('Supabase configuration requires a backend key and never silently falls back to SQLite', async () => {
  assert.throws(() => supabaseConfig({}), /SUPABASE_URL and SUPABASE_SECRET_KEY/);
  assert.throws(() => supabaseConfig({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_test' }), /not a publishable/);
  assert.throws(() => supabaseConfig({ SUPABASE_URL: 'https://user:pass@example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' }), /without a path or credentials/);
  assert.equal(supabaseConfig({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'sb_secret_test' }).projectUrl, 'http://127.0.0.1:54321');
  const token = `test.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`;
  assert.equal(supabaseConfig({ SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: token }).secretKey, token);
  await assert.rejects(openRepository({}), /Supabase is not configured/);
  await assert.rejects(openRepository({ DATABASE_PROVIDER: 'invalid' }), /supabase or sqlite/);
});

test('SQL migration protects tables and RPCs from anonymous and authenticated access', async () => {
  const { postgres } = harness;
  const rls = await postgres.query("select relrowsecurity from pg_class where relname in ('dairydash_products','dairydash_reviews','dairydash_settings')");
  assert.equal(rls.rows.length, 3);
  assert.ok(rls.rows.every((row) => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    await postgres.exec(`reset role; set role ${role}`);
    await assert.rejects(postgres.query('select * from public.dairydash_products'), /permission denied/);
    await assert.rejects(postgres.query('select * from public.dairydash_list_products()'), /permission denied/);
    await assert.rejects(postgres.query("select public.dairydash_seed_catalog('[]'::jsonb)"), /permission denied/);
  }
  await postgres.exec('reset role; set role service_role');
  assert.equal(await harness.database.healthy(), true);
  harness.state.bucketPublic = false;
  await assert.rejects(harness.database.healthy(), (error) => error.status === 503);
});

test('cloud CRUD stores uploaded bytes in Storage and returns an HTTPS photo URL', async () => {
  const { database, objects } = harness;
  const product = await database.createProduct(input(png));
  assert.equal(product.price, 149.5);
  assert.match(product.photo, /^https:\/\/dairydash-test\.supabase\.co\/storage\/v1\/object\/public\/dairydash-product-images\/products\//);
  assert.equal(objects.size, 1);
  assert.ok([...objects.values()][0].equals(Buffer.from(png.split(',')[1], 'base64')));
  assert.equal((await database.getProduct(product.id)).photo, product.photo);
  const updated = await database.updateProduct(product.id, { ...input(product.photo), priceCents: 15999 });
  assert.equal(updated.price, 159.99);
  assert.equal(objects.size, 1, 'editing fields must not upload the existing cloud image again');
  assert.equal(await database.deleteProduct(product.id), true);
  assert.equal(objects.size, 0);
  assert.equal(await database.getProduct(product.id), undefined);
  assert.equal(await database.deleteProduct(product.id), false);
});

test('replacing or removing an image cleans up only the product-owned Storage object', async () => {
  const { database, objects } = harness;
  const product = await database.createProduct(input(png));
  const oldPath = [...objects.keys()][0];
  await database.updateProduct(product.id, input(png));
  assert.equal(objects.size, 1);
  assert.equal(objects.has(oldPath), false);
  await database.updateProduct(product.id, input('https://example.com/external.jpg'));
  assert.equal(objects.size, 0);
  await database.deleteProduct(product.id);
  assert.equal(objects.size, 0);
});

test('failed database saves clean up uploads while lost commit responses retain referenced images', async () => {
  const { database, objects, state, postgres } = harness;
  state.failInsert = true;
  await assert.rejects(database.createProduct(input(png)), (error) => error.status === 503 && !error.message.includes('Private'));
  assert.equal(objects.size, 0);
  state.failInsert = false;
  state.loseInsertResponse = true;
  await assert.rejects(database.createProduct(input(png)), (error) => error.status === 503);
  const stored = (await postgres.query('select photo_storage_path from public.dairydash_products')).rows;
  assert.equal(stored.length, 1);
  assert.equal(objects.has(stored[0].photo_storage_path), true);
});

test('storage failures cannot cause phantom saves or undo successful database deletion', async () => {
  const { database, objects, state, warnings } = harness;
  state.failUpload = true;
  await assert.rejects(database.createProduct(input(png)), (error) => error.status === 503);
  assert.equal((await database.listProducts()).length, 0);
  state.failUpload = false;
  const product = await database.createProduct(input(png));
  state.failRemove = true;
  assert.equal(await database.deleteProduct(product.id), true);
  assert.equal(await database.getProduct(product.id), undefined);
  assert.equal(objects.size, 1);
  assert.equal(warnings.length, 1);
});

test('concurrent cloud edits return a conflict and preserve the winning image', async () => {
  const { database, objects, state, postgres } = harness;
  const product = await database.createProduct(input(png));
  const oldPath = [...objects.keys()][0];
  state.onUpload = async () => {
    await postgres.query("update public.dairydash_products set name = 'Concurrent edit' where id = $1", [product.id]);
  };
  await assert.rejects(database.updateProduct(product.id, input(png)), (error) => error.status === 409);
  assert.equal((await database.getProduct(product.id)).name, 'Concurrent edit');
  assert.equal(objects.size, 1);
  assert.equal(objects.has(oldPath), true);
});

test('cloud RPC search treats special characters literally and pages beyond Supabase row limits', async () => {
  const { database, postgres } = harness;
  await postgres.query(`insert into public.dairydash_products (id, name, category, price_cents, description)
    select 'custom-' || value, 'Milk ' || value, 'Fresh Milk', 29, 'Fresh' from generate_series(1, 1005) value`);
  assert.equal((await database.listProducts()).length, 1005);
  assert.equal((await database.listProducts({ search: "' OR 1=1 --" })).length, 0);
  assert.equal((await database.listProducts({ search: '%' })).length, 0);
  assert.equal((await database.listProducts({ search: 'MILK 1005', category: 'Fresh Milk' })).length, 1);
  assert.equal((await database.listProducts({ featured: true })).length, 0);
});

test('one-time cloud seed uploads catalog images and does not restore deleted products', async () => {
  const { database, postgres, objects } = harness;
  const catalog = [{
    id: 'seed-test-milk', name: 'Seed milk', price: '₱299.00', description: 'Seeded',
    imageBytes: Buffer.from('RIFFtestWEBP'), imageType: 'image/webp',
  }];
  assert.equal(await database.seedCatalog(catalog), 1);
  assert.equal(objects.size, 1);
  assert.equal((await database.listProducts({ featured: true }))[0].price, 299);
  await database.deleteProduct('seed-test-milk');
  assert.equal(objects.size, 0);
  assert.equal(await database.seedCatalog(catalog), 0);
  assert.equal((await database.listProducts()).length, 0);
  assert.equal((await postgres.query("select key from public.dairydash_settings where key = 'catalog_seeded'")).rows.length, 1);
});

test('Express awaits cloud reads/writes, returns reviews and propagates async errors', async (t) => {
  const { database } = harness;
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body) => fetch(base + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await request('/health')).status, 200);
  const created = await request('/products', 'POST', { name: 'HTTP milk', category: 'Fresh Milk', price: 0.29, description: '' });
  assert.equal(created.status, 201);
  const product = (await created.json()).data;
  assert.equal(product.price, 0.29);
  assert.equal((await (await request(`/products/${product.id}`)).json()).data.name, 'HTTP milk');
  assert.equal((await (await request('/products')).json()).data.length, 1);
  const review = await request(`/products/${product.id}/reviews`, 'POST', { name: 'Ana', rating: 5, comment: 'Cloud review' });
  assert.equal(review.status, 201);
  assert.ok(Date.parse((await review.json()).data.createdAt));
  assert.equal((await (await request(`/products/${product.id}/reviews`)).json()).data.length, 1);
  assert.equal((await request(`/products/${product.id}`, 'PUT', { name: 'Updated', category: 'Fresh Milk', price: 29, description: '' })).status, 200);
  assert.equal((await request(`/products/${product.id}`, 'DELETE')).status, 204);
  assert.deepEqual(await database.listReviews(product.id), []);
  assert.equal((await request(`/products/${product.id}`)).status, 404);
  assert.equal((await request(`/products/${product.id}/reviews`, 'POST', { name: 'Ana', rating: 5, comment: 'Missing product' })).status, 404);
});
