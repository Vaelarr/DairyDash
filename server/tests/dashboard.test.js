import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { summarizeDashboard } from '../dashboard.js';
import { openDatabase } from '../database.js';
import { ApiError } from '../errors.js';
import { validateOrder, validateProduct } from '../validation.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

const now = new Date('2026-10-22T16:30:00Z'); // October 23 in the Philippines.
const order = (createdAt, total, status = 'pending') => ({ createdAt, total, status });

test('dashboard uses Philippine calendar days, exact centavos and all active order statuses', () => {
  const summary = summarizeDashboard([
    order('2026-10-22T16:00:00Z', 0.1, 'completed'),
    order('2026-10-22T16:01:00Z', 0.2, 'preparing'),
    order('2026-10-22T23:00:00+08:00', 0.6),
    order('2026-10-23T00:02:00+08:00', 100, 'cancelled'),
    order('2026-10-21T12:00:00Z', 80),
  ], [
    { id: 'low', name: 'Low', stock: 5, photo: 'not returned' },
    { id: 'empty', name: 'Empty', stock: 0 },
    { id: 'full', name: 'Full', stock: 20 },
    { id: 'untracked', name: 'Untracked' },
  ], now);
  assert.equal(summary.date, '2026-10-23');
  assert.equal(summary.timeZone, 'Asia/Manila');
  assert.deepEqual(summary.today, { sales: 0.3, orderCount: 3, completedCount: 1, openCount: 1 });
  assert.deepEqual(summary.yesterday, { sales: 0.6 });
  assert.equal(summary.salesChangePct, -50);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.preparingCount, 1);
  assert.deepEqual(summary.inventory, { unitsInStock: 25, trackedProductCount: 3, lowStockProducts: [
    { id: 'empty', name: 'Empty', stock: 0 }, { id: 'low', name: 'Low', stock: 5 },
  ] });
});

test('dashboard handles year boundaries, empty sales and daily goal limits', () => {
  const newYear = new Date('2026-12-31T16:01:00Z');
  const summary = summarizeDashboard([
    order('2026-12-31T16:00:00Z', 6000), order('2026-12-31T15:59:59Z', 3000),
  ], [], newYear);
  assert.equal(summary.date, '2027-01-01');
  assert.equal(summary.yesterday.sales, 3000);
  assert.equal(summary.salesChangePct, 100);
  assert.equal(summary.dailyGoalPct, 100);
  const empty = summarizeDashboard([], [], now);
  assert.equal(empty.today.sales, 0);
  assert.equal(empty.dailyGoalPct, 0);
  assert.equal(empty.salesChangePct, 0);
  assert.deepEqual(empty.inventory, { unitsInStock: 0, trackedProductCount: 0, lowStockProducts: [] });
  assert.equal(summarizeDashboard([order(now.toISOString(), 1)], [], now).salesChangePct, 100);
});

async function serve(t, database, options = {}) {
  const server = createApp(database, options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return async (token = '') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/dashboard`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
}

test('dashboard requires verified admin permissions before reading any data, including SQLite mode', async (t) => {
  const database = {
    adminListOrders() { assert.fail('Unauthorized dashboard read'); },
    listProducts() { assert.fail('Unauthorized inventory read'); },
  };
  const request = await serve(t, database, { authenticate: async (token) => {
    if (token === 'unavailable') throw new ApiError(503, 'Account verification is unavailable. Try again.');
    if (token !== 'customer') throw new ApiError(401, 'Invalid session.');
    return { id: randomUUID(), user_metadata: { role: 'admin' }, app_metadata: {} };
  } });
  assert.equal((await request()).status, 401);
  assert.equal((await request('invalid')).status, 401);
  assert.equal((await request('customer')).status, 403);
  assert.equal((await request('unavailable')).status, 503);
  const offline = await serve(t, database);
  assert.equal((await offline('admin')).status, 503);
});

test('dashboard returns an error when inventory is unavailable instead of plausible partial totals', async (t) => {
  const request = await serve(t, {
    adminListOrders: async () => [],
    listProducts: async () => { throw new ApiError(503, 'Cloud database is unavailable. Try again.'); },
  }, { authenticate: async () => ({ id: randomUUID(), app_metadata: { role: 'admin' } }) });
  const response = await request('admin');
  assert.equal(response.status, 503);
  assert.equal(response.body.data, undefined);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });

for (const provider of ['sqlite', 'supabase']) {
  test(`${provider}: dashboard reads persisted orders, stock changes, cancellation and deletion`, async (t) => {
    const db = provider === 'supabase' ? harness.database : openDatabase(':memory:');
    if (provider === 'sqlite') t.after(() => db.close());
    for (const product of await db.listProducts()) await db.deleteProduct(product.id);
    const product = await db.createProduct(validateProduct({ name: 'Milk', category: 'Fresh Milk', price: 0.1, stock: 10, description: '' }));
    const owner = randomUUID();
    const makeOrder = (userId, quantity) => db.createOrder(userId, validateOrder({
      requestId: randomUUID(),
      customer: { name: 'Private Name', email: 'private@example.com', phone: '09123456789', address: 'Private address' },
      items: [{ productId: product.id, quantity, price: 0.1 }],
    }));
    const first = await makeOrder(owner, 1);
    const second = await makeOrder(randomUUID(), 2);
    const request = await serve(t, db, { authenticate: async () => ({ id: owner, app_metadata: { role: 'admin' } }) });
    const response = await request('admin');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.today.sales, 0.3);
    assert.equal(response.body.data.today.orderCount, 2);
    assert.equal(response.body.data.pendingCount, 2);
    assert.equal(response.body.data.inventory.unitsInStock, 7);
    for (const privateValue of ['Private Name', 'private@example.com', 'Private address', first.id, second.id, owner]) {
      assert.ok(!JSON.stringify(response.body).includes(privateValue));
    }
    const cancelled = await db.manageOrder(first.id, { id: owner, isAdmin: true }, first.updatedAt, { status: 'cancelled' });
    const afterCancel = (await request('admin')).body.data;
    assert.equal(afterCancel.today.sales, 0.2);
    assert.equal(afterCancel.today.orderCount, 2);
    assert.equal(afterCancel.pendingCount, 1);
    assert.equal(afterCancel.inventory.unitsInStock, 8);
    await db.manageOrder(first.id, { id: owner, isAdmin: true }, cancelled.updatedAt, {}, true);
    assert.equal((await request('admin')).body.data.today.orderCount, 1);
  });
}
