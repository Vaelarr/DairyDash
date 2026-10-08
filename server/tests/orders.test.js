import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { before, after, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../database.js';
import { validateOrder, validateProduct } from '../validation.js';
import { createAuthenticator } from '../auth.js';
import { ApiError } from '../errors.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

const userId = randomUUID();
const otherUserId = randomUUID();
const customer = { name: 'Ana', email: 'ana@example.com', phone: '09123456789', address: '123 Farm Street' };
const milk = (name = 'Milk', stock = 5, price = 0.29) => validateProduct({ name, category: 'Fresh Milk', price, stock, description: '' });
const checkout = (items, extra = {}) => ({ requestId: randomUUID(), customer, items, ...extra });
let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });

for (const provider of ['sqlite', 'supabase']) {
  async function databaseFor(t) {
    if (provider === 'supabase') return harness.database;
    const db = openDatabase(':memory:');
    t.after(() => db.close());
    return db;
  }

  test(`${provider}: checkout saves exact totals, decrements stock once, and isolates customer orders`, async (t) => {
    const db = await databaseFor(t);
    const product = await db.createProduct(milk());
    const input = validateOrder(checkout([{ productId: product.id, quantity: 3, price: 0.29 }]));
    const order = await db.createOrder(userId, input);
    assert.equal(order.status, 'pending');
    assert.equal(order.total, 0.87);
    assert.equal(order.items[0].total, 0.87);
    assert.equal(order.customer.address, customer.address);
    assert.equal((await db.getProduct(product.id)).stock, 2);
    assert.deepEqual(await db.createOrder(userId, input), order);
    assert.equal((await db.getProduct(product.id)).stock, 2);
    assert.equal((await db.listOrders(userId)).length, 1);
    assert.deepEqual(await db.listOrders(otherUserId), []);
    assert.ok(!await db.getOrder(order.id, otherUserId));
    assert.equal((await db.getOrder(order.id, userId)).id, order.id);
    const changed = validateOrder({ ...checkout([{ productId: product.id, quantity: 1, price: 0.29 }]), requestId: input.requestId });
    await assert.rejects(async () => db.createOrder(userId, changed), (error) => error.status === 409);
    await db.updateProduct(product.id, milk('Changed name', 2, 100));
    assert.equal((await db.getOrder(order.id, userId)).items[0].name, 'Milk');
    assert.equal((await db.getOrder(order.id, userId)).total, 0.87);
    await db.deleteProduct(product.id);
    const saved = await db.getOrder(order.id, userId);
    assert.equal(saved.items[0].productId, null);
    assert.equal(saved.items[0].name, 'Milk');
    assert.equal((await db.createOrder(userId, input)).id, order.id);
  });

  test(`${provider}: rejected checkout rolls back every stock change and partial order`, async (t) => {
    const db = await databaseFor(t);
    const a = await db.createProduct(milk('Available', 5));
    const b = await db.createProduct(milk('Unavailable', 0));
    await assert.rejects(async () => db.createOrder(userId, validateOrder(checkout([
      { productId: a.id, quantity: 2, price: 0.29 }, { productId: b.id, quantity: 1, price: 0.29 },
    ]))), (error) => error.status === 409);
    assert.equal((await db.getProduct(a.id)).stock, 5);
    assert.equal((await db.listOrders(userId)).length, 0);
    for (const item of [
      { productId: a.id, quantity: 1, price: 0.01 },
      { productId: 'missing-product', quantity: 1, price: 0.29 },
    ]) await assert.rejects(async () => db.createOrder(userId, validateOrder(checkout([item]))), (error) => error.status === 409);
    assert.equal((await db.getProduct(a.id)).stock, 5);
    assert.equal((await db.listOrders(userId)).length, 0);
  });

  test(`${provider}: unset stock is allowed and maximum order totals do not overflow`, async (t) => {
    const db = await databaseFor(t);
    const product = await db.createProduct(milk('Untracked milk', null, 999999.99));
    const order = await db.createOrder(userId, validateOrder(checkout([{ productId: product.id, quantity: 99, price: 999999.99 }])));
    assert.equal(order.total, 98999999.01);
    assert.equal('stock' in await db.getProduct(product.id), false);
  });
}

test('cloud checkout recovers a lost response without creating another order or consuming stock twice', async () => {
  const db = harness.database;
  const product = await db.createProduct(milk());
  const input = validateOrder(checkout([{ productId: product.id, quantity: 1, price: 0.29 }]));
  harness.state.loseOrderResponse = true;
  await assert.rejects(() => db.createOrder(userId, input), (error) => error.status === 503);
  harness.state.loseOrderResponse = false;
  const order = await db.createOrder(userId, input);
  assert.equal((await db.listOrders(userId)).length, 1);
  assert.equal((await db.getProduct(product.id)).stock, 4);
  assert.equal(order.total, 0.29);
});

test('cloud order tables and RPCs are unavailable to direct browser roles', async () => {
  const { postgres } = harness;
  for (const role of ['anon', 'authenticated']) {
    await postgres.exec(`reset role; set role ${role}`);
    await assert.rejects(() => postgres.query('select * from public.dairydash_orders'), /permission denied/);
    await assert.rejects(() => postgres.query('select * from public.dairydash_order_items'), /permission denied/);
    await assert.rejects(() => postgres.query('select public.dairydash_list_orders($1::uuid)', [userId]), /permission denied/);
    await assert.rejects(() => postgres.query('select public.dairydash_create_order($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb)',
      [userId, randomUUID(), '0'.repeat(64), JSON.stringify(customer), '[]']), /permission denied/);
  }
  await postgres.exec('reset role; set role service_role');
});

test('checkout rejects malformed or duplicate items and creates a stable retry fingerprint', () => {
  const valid = checkout([{ productId: 'milk', quantity: 1, price: 0.29 }]);
  for (const invalid of [
    null, [], {}, { ...valid, requestId: 'invalid' }, { ...valid, customer: {} },
    { ...valid, customer: { ...customer, email: 'bad' } }, { ...valid, customer: { ...customer, phone: 'letters' } },
    { ...valid, items: [] }, { ...valid, items: [null] }, { ...valid, items: [...valid.items, ...valid.items] },
    ...[0, -1, 100, 1.1, '1'].map((quantity) => ({ ...valid, items: [{ ...valid.items[0], quantity }] })),
    ...[0, '0.29', 0.291].map((price) => ({ ...valid, items: [{ ...valid.items[0], price }] })),
  ]) assert.throws(() => validateOrder(invalid), (error) => error.status === 400);
  const a = validateOrder(checkout([{ productId: 'a', quantity: 1, price: 1 }, { productId: 'b', quantity: 2, price: 2 }]));
  const b = validateOrder({ ...checkout([...a.items].reverse().map((item) => ({ ...item, price: item.priceCents / 100 }))), customer: { ...customer, name: ' Ana ' } });
  assert.equal(a.requestHash, b.requestHash);
});

test('API requires verified sessions, blocks customer product writes, and prevents metadata admin spoofing', async (t) => {
  const db = openDatabase(':memory:');
  const authenticate = async (token) => {
    if (token === 'admin') return { id: userId, email: customer.email, app_metadata: { role: 'admin' } };
    if (token === 'customer') return { id: userId, email: customer.email, user_metadata: { role: 'admin' }, app_metadata: {} };
    if (token === 'other') return { id: otherUserId, app_metadata: {} };
    throw new ApiError(401, 'Invalid session.');
  };
  const server = createApp(db, { authenticate }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    db.close();
  });
  const request = (path, method = 'GET', body, token) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('/products')).status, 200);
  assert.equal((await request('/orders')).status, 401);
  assert.equal((await request('/orders', 'GET', undefined, 'invalid')).status, 401);
  const body = { name: 'API milk', category: 'Fresh Milk', price: 0.29, stock: 2, description: '' };
  assert.equal((await request('/products', 'POST', body)).status, 401);
  assert.equal((await request('/products', 'POST', body, 'customer')).status, 403);
  const created = await request('/products', 'POST', body, 'admin');
  assert.equal(created.status, 201);
  const product = (await created.json()).data;
  assert.equal((await request(`/products/${product.id}`, 'PUT', body, 'customer')).status, 403);
  assert.equal((await request(`/products/${product.id}`, 'DELETE', undefined, 'customer')).status, 403);
  assert.equal((await request(`/products/${product.id}/reviews`, 'POST', { name: 'Ana', rating: 5, comment: 'Good' })).status, 401);
  const input = checkout([{ productId: product.id, quantity: 1, price: 0.29 }]);
  const response = await request('/orders', 'POST', { ...input, userId: otherUserId, total: 0.01 }, 'customer');
  assert.equal(response.status, 201);
  const order = (await response.json()).data;
  assert.equal(order.total, 0.29);
  assert.equal((await request(`/orders/${order.id}`, 'GET', undefined, 'other')).status, 404);
  assert.deepEqual((await (await request('/orders', 'GET', undefined, 'other')).json()).data, []);
  assert.equal((await request(`/orders/${order.id}`, 'GET', undefined, 'customer')).status, 200);
  assert.equal((await request('/orders', 'POST', input, 'customer')).status, 201);
  assert.equal((await request('/orders/not-a-uuid', 'GET', undefined, 'customer')).status, 404);
  assert.equal((await request('/orders/' + '-'.repeat(36), 'GET', undefined, 'customer')).status, 404);
  assert.equal((await (await request('/account', 'GET', undefined, 'customer')).json()).data.isAdmin, false);
});

test('Auth distinguishes invalid sessions from outages without exposing diagnostics', async () => {
  const bad = createAuthenticator({ auth: { getUser: async () => ({ error: { status: 401, message: 'Private diagnostic' } }) } });
  const unavailable = createAuthenticator({ auth: { getUser: async () => ({ error: { status: 503, message: 'Private diagnostic' } }) } });
  await assert.rejects(() => bad('token'), (error) => error.status === 401 && !error.message.includes('Private'));
  await assert.rejects(() => unavailable('token'), (error) => error.status === 503 && !error.message.includes('Private'));
});

test('SQLite version 1 upgrades preserve existing catalog and reviews without reseeding', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dairydash-upgrade-'));
  const path = join(directory, 'catalog.sqlite');
  let legacy;
  let db;
  try {
    legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT, category TEXT, price_cents INTEGER, stock INTEGER,
        description TEXT, photo TEXT, catalog_position INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE reviews (id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
        name TEXT, rating INTEGER, comment TEXT, created_at TEXT);
      INSERT INTO products VALUES ('legacy-milk', 'My edited milk', 'Fresh Milk', 29, 4, '', NULL, NULL,
        '2026-10-07T00:00:00Z', '2026-10-07T00:00:00Z');
      INSERT INTO reviews VALUES ('old-review', 'legacy-milk', 'Ana', 5, 'Existing review', '2026-10-07T00:00:00Z');
      PRAGMA user_version = 1;
    `);
    legacy.close();
    legacy = undefined;
    db = openDatabase(path);
    assert.equal(db.listProducts().length, 1);
    assert.equal(db.getProduct('legacy-milk').name, 'My edited milk');
    assert.equal(db.listReviews('legacy-milk')[0].comment, 'Existing review');
    const input = validateOrder(checkout([{ productId: 'legacy-milk', quantity: 1, price: 0.29 }]));
    const order = db.createOrder(userId, input);
    db.close();
    db = openDatabase(path);
    assert.equal(db.getOrder(order.id, userId).total, 0.29);
    assert.equal(db.getProduct('legacy-milk').stock, 3);
  } finally {
    legacy?.close();
    db?.close();
    // Each named test file stays inside this test's freshly created temporary directory.
    for (const name of ['catalog.sqlite', 'catalog.sqlite-wal', 'catalog.sqlite-shm']) rmSync(join(directory, name), { force: true });
    rmdirSync(directory);
  }
});
