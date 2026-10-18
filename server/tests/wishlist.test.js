import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../database.js';
import { ApiError } from '../errors.js';
import { validateOrder, validateProduct } from '../validation.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

const ownerId = randomUUID();
const otherId = randomUUID();
const adminId = randomUUID();
const productInput = { name: 'Wishlist milk', category: 'Fresh Milk', price: 149.5, stock: 0 };
let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });

for (const provider of ['sqlite', 'supabase']) {
  async function fixture(t) {
    const db = provider === 'sqlite' ? openDatabase(':memory:') : harness.database;
    const product = await db.createProduct(validateProduct(productInput));
    const app = createApp(db, { authenticate: async (token) => {
      if (!['owner', 'another-device', 'other', 'admin'].includes(token)) throw new ApiError(401, 'Sign in to continue.');
      return { id: token === 'other' ? otherId : token === 'admin' ? adminId : ownerId,
        app_metadata: token === 'admin' ? { role: 'admin' } : {} };
    } });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
      await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
      if (provider === 'sqlite') db.close();
    });
    const url = `http://127.0.0.1:${server.address().port}/api/wishlist`;
    async function request(path = '', method = 'GET', token = 'owner', body) {
      const response = await fetch(url + path, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(method === 'PUT' ? { body: JSON.stringify(body ?? {}) } : {}),
      });
      return { status: response.status, headers: response.headers,
        body: response.status === 204 ? undefined : await response.json() };
    }
    return { db, product, request };
  }

  test(`${provider}: wishlist requires a verified account and never trusts a supplied owner`, async (t) => {
    const { product, request } = await fixture(t);
    for (const token of ['', 'invalid']) {
      for (const [path, method] of [['', 'GET'], [`/${product.id}`, 'PUT'], [`/${product.id}`, 'DELETE']]) {
        assert.equal((await request(path, method, token)).status, 401);
      }
    }
    assert.deepEqual((await request()).body.data, []);
    const saved = await request(`/${product.id}`, 'PUT', 'owner', { userId: otherId, user_id: otherId });
    assert.equal(saved.status, 200);
    assert.deepEqual(Object.keys(saved.body.data).sort(), ['createdAt', 'productId']);
    assert.equal(saved.body.data.productId, product.id);
    assert.ok(Number.isFinite(Date.parse(saved.body.data.createdAt)));
    assert.deepEqual((await request(`?userId=${ownerId}`, 'GET', 'other')).body.data, []);
    assert.deepEqual((await request(`?userId=${ownerId}`, 'GET', 'admin')).body.data, []);
    const list = await request();
    assert.deepEqual(list.body.data, [saved.body.data]);
    assert.equal(list.headers.get('cache-control'), 'no-store');
  });

  test(`${provider}: wishlist survives another device and repeated saves/removals are safe`, async (t) => {
    const { db, product, request } = await fixture(t);
    const path = `/${product.id}`;
    const first = await request(path, 'PUT');
    assert.deepEqual((await request(path, 'PUT')).body, first.body);
    assert.deepEqual((await request('', 'GET', 'another-device')).body.data, [first.body.data]);
    assert.equal((await db.getProduct(product.id)).stock, 0);
    assert.deepEqual(await db.listOrders(ownerId), []);
    assert.equal((await request(path, 'PUT', 'other')).status, 200);
    assert.equal((await request(path, 'DELETE')).status, 204);
    assert.equal((await request(path, 'DELETE')).status, 204);
    assert.deepEqual((await request()).body.data, []);
    assert.equal((await request('', 'GET', 'other')).body.data.length, 1);
  });

  test(`${provider}: concurrent wishlist saves create one entry and keep the original timestamp`, async (t) => {
    const { product, request } = await fixture(t);
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(`/${product.id}`, 'PUT')));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, responses[0].body);
    }
    assert.deepEqual((await request()).body.data, [responses[0].body.data]);
    const removals = await Promise.all(Array.from({ length: 12 }, () => request(`/${product.id}`, 'DELETE')));
    assert.ok(removals.every((response) => response.status === 204));
    assert.deepEqual((await request()).body.data, []);
  });

  test(`${provider}: missing products cannot be saved and product deletion cleans every wishlist`, async (t) => {
    const { db, product, request } = await fixture(t);
    assert.equal((await request('/missing-product', 'PUT')).status, 404);
    await assert.rejects(async () => db.saveWishlist(ownerId, 'missing-product'), (error) => error.status === 404);
    assert.equal((await request('/missing-product', 'DELETE')).status, 204);
    for (const token of ['owner', 'other']) assert.equal((await request(`/${product.id}`, 'PUT', token)).status, 200);
    await db.deleteProduct(product.id);
    for (const token of ['owner', 'other']) assert.deepEqual((await request('', 'GET', token)).body.data, []);
    assert.equal((await request(`/${product.id}`, 'PUT')).status, 404);
    assert.equal((await request(`/${product.id}`, 'DELETE')).status, 204);
  });
}

test('SQLite version 4 upgrade preserves products, reviews and orders, and wishlist persists after reopening', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'dairydash-wishlist-'));
  const path = join(directory, 'database.sqlite');
  let db = openDatabase(path);
  t.after(() => {
    db?.close();
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  });
  const product = db.createProduct(validateProduct({ ...productInput, stock: 10 }));
  const review = db.createReview(product.id, { name: 'Ana', rating: 5, comment: 'Fresh milk.' }, ownerId);
  const order = db.createOrder(ownerId, validateOrder({ requestId: randomUUID(),
    customer: { name: 'Ana', email: 'ana@example.com', phone: '09123456789', address: '123 Farm Street' },
    items: [{ productId: product.id, quantity: 1, price: 149.5 }],
  }));
  const savedProduct = db.getProduct(product.id);
  db.close(); db = undefined;
  const previous = new DatabaseSync(path);
  previous.exec('DROP TABLE wishlist; PRAGMA user_version = 4;');
  previous.close();
  db = openDatabase(path);
  assert.deepEqual(db.getProduct(product.id), savedProduct);
  assert.deepEqual(db.getReview(product.id, review.id), review);
  assert.deepEqual(db.getOrder(order.id, ownerId), order);
  const saved = db.saveWishlist(ownerId, product.id);
  db.close(); db = openDatabase(path);
  assert.deepEqual(db.listWishlist(ownerId), [saved]);
});

test('cloud wishlist migration is repeatable and direct browser roles cannot read or forge entries', async () => {
  const product = await harness.database.createProduct(validateProduct(productInput));
  const saved = await harness.database.saveWishlist(ownerId, product.id);
  const migration = await readFile(new URL('../../supabase/migrations/202610180001_wishlist.sql', import.meta.url), 'utf8');
  await harness.postgres.exec('reset role');
  await harness.postgres.exec(migration);
  await harness.postgres.exec('set role service_role');
  assert.deepEqual(await harness.database.listWishlist(ownerId), [saved]);
  try {
    for (const role of ['anon', 'authenticated']) {
      await harness.postgres.exec(`reset role; set role ${role}`);
      await assert.rejects(() => harness.postgres.query('select * from public.dairydash_wishlist'), /permission denied/);
      await assert.rejects(() => harness.postgres.query('insert into public.dairydash_wishlist(user_id, product_id) values ($1::uuid, $2)',
        [ownerId, product.id]), /permission denied/);
      await assert.rejects(() => harness.postgres.query('select public.dairydash_save_wishlist($1::uuid, $2)',
        [ownerId, product.id]), /permission denied/);
    }
  } finally {
    await harness.postgres.exec('reset role; set role service_role');
  }
});

test('cloud wishlist lists all pages without exposing another account', async () => {
  await harness.postgres.query(`insert into public.dairydash_products(id, name, price_cents)
    select 'wishlist-' || n, 'Milk', 100 from generate_series(1, 505) as n`);
  await harness.postgres.query(`insert into public.dairydash_wishlist(user_id, product_id)
    select $1::uuid, id from public.dairydash_products`, [ownerId]);
  const items = await harness.database.listWishlist(ownerId);
  assert.equal(items.length, 505);
  assert.equal(new Set(items.map((item) => item.productId)).size, 505);
  assert.deepEqual(await harness.database.listWishlist(otherId), []);
});
