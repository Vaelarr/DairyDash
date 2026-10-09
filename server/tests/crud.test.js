import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../database.js';
import { ApiError } from '../errors.js';
import { validateOrder, validateProduct, validateVersion, validateDeleteVersion, validateOrderUpdate } from '../validation.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

const author = { id: randomUUID(), isAdmin: false };
const other = { id: randomUUID(), isAdmin: false };
const admin = { id: randomUUID(), isAdmin: true };
const customer = { name: 'Ana', email: 'ana@example.com', phone: '09123456789', address: '123 Farm Street' };
const reviewInput = { name: 'Ana', rating: 5, comment: 'Fresh milk' };
const milk = (stock = 10) => validateProduct({ name: 'Milk', category: 'Fresh Milk', price: 25, stock, description: '' });
let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });
const conflict = (error) => error.status === 409;

for (const provider of ['sqlite', 'supabase']) {
  async function fixture(t, stock = 10) {
    const db = provider === 'supabase' ? harness.database : openDatabase(':memory:');
    if (provider === 'sqlite') t.after(() => db.close());
    const product = await db.createProduct(milk(stock));
    const input = validateOrder({ requestId: randomUUID(), customer, items: [{ productId: product.id, quantity: 2, price: 25 }] });
    return { db, product, input };
  }

  test(`${provider}: review CRUD enforces ownership, versions, product association and admin moderation`, async (t) => {
    const { db, product } = await fixture(t);
    const created = await db.createReview(product.id, reviewInput, author.id);
    assert.equal(created.userId, author.id);
    assert.ok(created.updatedAt);
    assert.equal((await db.getReview(product.id, created.id)).comment, reviewInput.comment);
    assert.ok(!await db.getReview('wrong-product', created.id));
    await assert.rejects(async () => db.manageReview(product.id, created.id, other, created.updatedAt, reviewInput), (e) => e.status === 403);
    await assert.rejects(async () => db.manageReview(product.id, created.id, other, created.updatedAt, {}, true), (e) => e.status === 403);
    const updated = await db.manageReview(product.id, created.id, author, created.updatedAt, { ...reviewInput, name: 'Ana Maria', rating: 4, comment: 'Updated feedback' });
    assert.equal(updated.comment, 'Updated feedback');
    assert.notEqual(updated.updatedAt, created.updatedAt);
    assert.equal(updated.userId, author.id);
    assert.equal(Date.parse(updated.createdAt), Date.parse(created.createdAt));
    await assert.rejects(async () => db.manageReview(product.id, created.id, author, created.updatedAt, reviewInput), conflict);
    await assert.rejects(async () => db.manageReview(product.id, created.id, admin, created.updatedAt, {}, true), conflict);
    const moderated = await db.manageReview(product.id, created.id, admin, updated.updatedAt, { ...reviewInput, comment: 'Moderated' });
    await db.manageReview(product.id, created.id, author, moderated.updatedAt, {}, true);
    assert.ok(!await db.getReview(product.id, created.id));
    assert.ok(!await db.manageReview(product.id, created.id, admin, moderated.updatedAt, {}, true));
    assert.deepEqual(await db.listReviews(product.id), []);
    const legacy = await db.createReview(product.id, reviewInput);
    await assert.rejects(async () => db.manageReview(product.id, legacy.id, author, legacy.updatedAt, reviewInput), (e) => e.status === 403);
    await db.manageReview(product.id, legacy.id, admin, legacy.updatedAt, {}, true);
  });

  test(`${provider}: pending delivery updates protect owner, immutable totals and stale saves`, async (t) => {
    const { db, product, input } = await fixture(t);
    const created = await db.createOrder(author.id, input);
    assert.ok(!await db.manageOrder(created.id, other, created.updatedAt, { customer }));
    const updated = await db.manageOrder(created.id, author, created.updatedAt, { customer: { ...customer, address: '456 New Street' } });
    assert.equal(updated.customer.address, '456 New Street');
    assert.equal(updated.total, 50);
    assert.deepEqual(updated.items, created.items);
    assert.notEqual(updated.updatedAt, created.updatedAt);
    assert.equal((await db.getProduct(product.id)).stock, 8);
    await assert.rejects(async () => db.manageOrder(created.id, author, created.updatedAt, { status: 'cancelled' }), conflict);
    await assert.rejects(async () => db.manageOrder(created.id, author, updated.updatedAt, { status: 'confirmed' }), conflict);
    assert.equal((await db.adminGetOrder(created.id)).customer.address, updated.customer.address);
    assert.equal((await db.adminListOrders()).length, 1);
    assert.ok(!await db.getOrder(created.id, admin.id));
    assert.equal((await db.createOrder(author.id, input)).customer.address, updated.customer.address);
  });

  test(`${provider}: cancellation and deletion restore stock once and cannot resurrect checkout retries`, async (t) => {
    const { db, product, input } = await fixture(t);
    const created = await db.createOrder(author.id, input);
    const cancelled = await db.manageOrder(created.id, author, created.updatedAt, { status: 'cancelled' });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((await db.getProduct(product.id)).stock, 10);
    await assert.rejects(async () => db.manageOrder(created.id, author, cancelled.updatedAt, { status: 'pending' }), conflict);
    await db.manageOrder(created.id, author, cancelled.updatedAt, {}, true);
    assert.equal((await db.getProduct(product.id)).stock, 10);
    assert.ok(!await db.getOrder(created.id, author.id));
    assert.deepEqual(await db.listOrders(author.id), []);
    assert.deepEqual(await db.adminListOrders(), []);
    assert.ok(!await db.manageOrder(created.id, admin, cancelled.updatedAt, {}, true));
    await assert.rejects(async () => db.createOrder(author.id, input), conflict);
    assert.equal((await db.getProduct(product.id)).stock, 10);
    const next = await db.createOrder(author.id, { ...input, requestId: randomUUID() });
    await db.manageOrder(next.id, author, next.updatedAt, {}, true);
    assert.equal((await db.getProduct(product.id)).stock, 10);
  });

  test(`${provider}: admins manage confirmed/completed orders while customers cannot bypass fulfillment`, async (t) => {
    const { db, product, input } = await fixture(t);
    const created = await db.createOrder(author.id, input);
    await assert.rejects(async () => db.manageOrder(created.id, admin, created.updatedAt, { status: 'completed' }), conflict);
    let order = await db.manageOrder(created.id, admin, created.updatedAt, { status: 'confirmed' });
    for (const [change, remove] of [[{ customer }, false], [{ status: 'cancelled' }, false], [{}, true]]) {
      await assert.rejects(async () => db.manageOrder(order.id, author, order.updatedAt, change, remove), conflict);
    }
    order = await db.manageOrder(order.id, admin, order.updatedAt, { customer: { ...customer, phone: '09999999999' } });
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'completed' });
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, { status: 'cancelled' }), conflict);
    await db.manageOrder(order.id, admin, order.updatedAt, {}, true);
    assert.equal((await db.getProduct(product.id)).stock, 8, 'Completed orders consumed stock');
    const confirmed = await db.createOrder(author.id, { ...input, requestId: randomUUID() });
    const saved = await db.manageOrder(confirmed.id, admin, confirmed.updatedAt, { status: 'confirmed' });
    await db.manageOrder(saved.id, admin, saved.updatedAt, {}, true);
    assert.equal((await db.getProduct(product.id)).stock, 8, 'Deleting an active confirmed order restores only its reservation');
  });

  test(`${provider}: untracked stock and removed products do not gain inventory during cancellation`, async (t) => {
    const { db, product, input } = await fixture(t, null);
    let order = await db.createOrder(author.id, input);
    await db.updateProduct(product.id, milk(20));
    await db.manageOrder(order.id, author, order.updatedAt, { status: 'cancelled' });
    assert.equal((await db.getProduct(product.id)).stock, 20);
    order = await db.createOrder(author.id, { ...input, requestId: randomUUID() });
    await db.deleteProduct(product.id);
    order = await db.manageOrder(order.id, author, order.updatedAt, { status: 'cancelled' });
    assert.equal(order.items[0].productId, null);
    assert.equal(order.items[0].name, 'Milk');
    assert.equal(order.total, 50);
  });

  test(`${provider}: failed stock restoration rolls back the order and all inventory`, async (t) => {
    const { db, product, input } = await fixture(t);
    const second = await db.createProduct(milk());
    const order = await db.createOrder(author.id, validateOrder({ requestId: randomUUID(), customer,
      items: [...input.items.map((i) => ({ ...i, price: i.priceCents / 100 })), { productId: second.id, quantity: 2, price: 25 }] }));
    await db.updateProduct(second.id, milk(1000000000));
    await assert.rejects(async () => db.manageOrder(order.id, author, order.updatedAt, {}, true), conflict);
    assert.equal((await db.getProduct(product.id)).stock, 8);
    assert.equal((await db.getProduct(second.id)).stock, 1000000000);
    assert.equal((await db.getOrder(order.id, author.id)).status, 'pending');
    assert.equal((await db.getOrder(order.id, author.id)).updatedAt, order.updatedAt);
  });

  test(`${provider}: HTTP review/order CRUD rejects missing auth, forged roles, stale versions and invalid edits`, async (t) => {
    const { db, product, input } = await fixture(t);
    const authenticate = async (token) => {
      const actor = { author, other, admin }[token];
      if (!actor) throw new ApiError(401, 'Invalid session.');
      return { id: actor.id, app_metadata: actor.isAdmin ? { role: 'admin' } : {}, user_metadata: { role: 'admin' } };
    };
    const server = createApp(db, { authenticate }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); });
    const request = (path, method = 'GET', body, token = 'author', version) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(version ? { 'If-Match': `"${version}"` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const response = await request(`/products/${product.id}/reviews`, 'POST', { ...reviewInput, userId: other.id });
    assert.equal(response.status, 201);
    let review = (await response.json()).data;
    assert.equal(review.userId, author.id);
    const path = `/products/${product.id}/reviews/${review.id}`;
    assert.equal((await request(path, 'GET', undefined, '')).status, 200);
    assert.equal((await request(path, 'PUT', { ...reviewInput, updatedAt: review.updatedAt }, '')).status, 401);
    assert.equal((await request(path, 'DELETE', undefined, 'other', review.updatedAt)).status, 403);
    assert.equal((await request(path, 'PUT', { ...reviewInput, rating: 9, updatedAt: review.updatedAt })).status, 400);
    assert.equal((await request(path, 'PUT', reviewInput)).status, 400);
    const edit = await request(path, 'PUT', { ...reviewInput, comment: 'New feedback', updatedAt: review.updatedAt });
    assert.equal(edit.status, 200);
    assert.equal((await request(path, 'DELETE', undefined, 'admin', review.updatedAt)).status, 409);
    review = (await edit.json()).data;
    assert.equal((await request(path, 'DELETE', undefined, 'admin')).status, 400);
    assert.equal((await request(path, 'DELETE', undefined, 'admin', review.updatedAt)).status, 204);
    assert.equal((await request(path)).status, 404);
    const post = await request('/orders', 'POST', { requestId: input.requestId, customer, items: [{ productId: product.id, quantity: 2, price: 25 }] });
    assert.equal(post.status, 201);
    let order = (await post.json()).data;
    const orderPath = `/orders/${order.id}`;
    assert.equal((await request('/admin/orders', 'GET', undefined, 'other')).status, 403);
    assert.equal((await request(`/admin${orderPath}`, 'PUT', { status: 'confirmed', updatedAt: order.updatedAt }, 'other')).status, 403);
    assert.equal((await request(orderPath, 'PUT', { customer, updatedAt: order.updatedAt }, 'other')).status, 404);
    assert.equal((await request(orderPath, 'DELETE', undefined, 'other', order.updatedAt)).status, 404);
    assert.equal((await request(orderPath, 'PUT', { status: 'completed', updatedAt: order.updatedAt })).status, 409);
    assert.equal((await request(orderPath, 'PUT', { total: 0, updatedAt: order.updatedAt })).status, 400);
    assert.equal((await request(orderPath, 'PUT', { customer: { ...customer, email: 'invalid' }, updatedAt: order.updatedAt })).status, 400);
    const saved = await request(orderPath, 'PUT', { customer: { ...customer, address: '456 New Street' }, updatedAt: order.updatedAt });
    assert.equal(saved.status, 200);
    assert.equal((await request(orderPath, 'DELETE', undefined, 'author', order.updatedAt)).status, 409);
    order = (await saved.json()).data;
    assert.equal((await request(`/admin${orderPath}`, 'GET', undefined, 'admin')).status, 200);
    assert.equal((await request('/admin/orders', 'GET', undefined, 'admin')).status, 200);
    assert.equal((await request(orderPath, 'DELETE', undefined, '', order.updatedAt)).status, 401);
    assert.equal((await request(orderPath, 'DELETE', undefined, 'author', order.updatedAt)).status, 204);
    assert.equal((await request(orderPath)).status, 404);
    assert.equal((await request(`/admin${orderPath}`, 'GET', undefined, 'admin')).status, 404);
    assert.equal((await db.getProduct(product.id)).stock, 10);
    const replay = await request('/orders', 'POST', { requestId: input.requestId, customer, items: [{ productId: product.id, quantity: 2, price: 25 }] });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.code, 'CHECKOUT_DELETED');
  });
}

test('lost cancellation response cannot restore stock a second time', async () => {
  const db = harness.database;
  const product = await db.createProduct(milk());
  const order = await db.createOrder(author.id, validateOrder({ requestId: randomUUID(), customer, items: [{ productId: product.id, quantity: 2, price: 25 }] }));
  harness.state.loseOrderResponse = true;
  await assert.rejects(() => db.manageOrder(order.id, author, order.updatedAt, { status: 'cancelled' }), (e) => e.status === 503);
  harness.state.loseOrderResponse = false;
  await assert.rejects(() => db.manageOrder(order.id, author, order.updatedAt, { status: 'cancelled' }), conflict);
  const saved = await db.getOrder(order.id, author.id);
  await db.manageOrder(order.id, admin, saved.updatedAt, { status: 'cancelled' });
  assert.equal((await db.getProduct(product.id)).stock, 10);
});

test('legacy reservations require verification, and reapplying the migration preserves all records', async () => {
  const db = harness.database;
  const product = await db.createProduct(milk());
  const order = await db.createOrder(author.id, validateOrder({ requestId: randomUUID(), customer, items: [{ productId: product.id, quantity: 2, price: 25 }] }));
  const review = await db.createReview(product.id, reviewInput, author.id);
  await harness.postgres.query('update public.dairydash_order_items set stock_deducted = null where order_id = $1::uuid', [order.id]);
  await assert.rejects(() => db.manageOrder(order.id, admin, order.updatedAt, {}, true), conflict);
  assert.equal((await db.getProduct(product.id)).stock, 8);
  const migration = await readFile(new URL('../../supabase/migrations/202610090001_review_order_crud.sql', import.meta.url), 'utf8');
  await harness.postgres.exec('reset role');
  await harness.postgres.exec(migration);
  await harness.postgres.exec('set role service_role');
  assert.equal((await db.getReview(product.id, review.id)).comment, reviewInput.comment);
  assert.equal((await db.getOrder(order.id, author.id)).total, 50);
  await harness.postgres.query('update public.dairydash_order_items set stock_deducted = true where order_id = $1::uuid', [order.id]);
  await db.manageOrder(order.id, admin, order.updatedAt, {}, true);
  assert.equal((await db.getProduct(product.id)).stock, 10);
});

test('CRUD RPCs cannot be invoked directly with a browser key or a forged admin flag', async () => {
  for (const role of ['anon', 'authenticated']) {
    await harness.postgres.exec(`reset role; set role ${role}`);
    await assert.rejects(() => harness.postgres.query('select public.dairydash_admin_list_orders()'), /permission denied/);
    await assert.rejects(() => harness.postgres.query('select public.dairydash_admin_get_order($1::uuid)', [randomUUID()]), /permission denied/);
    await assert.rejects(() => harness.postgres.query('select public.dairydash_manage_order($1::uuid, $2::uuid, true, now(), $3::jsonb, true)', [randomUUID(), author.id, '{}']), /permission denied/);
    await assert.rejects(() => harness.postgres.query('select public.dairydash_manage_review($1::uuid, $2, $3::uuid, true, now(), $4::jsonb, true)', [randomUUID(), 'milk', author.id, '{}']), /permission denied/);
  }
  await harness.postgres.exec('reset role; set role service_role');
});

test('update validation requires a precise version and safe editable fields', () => {
  const version = '2026-10-09T01:02:03.123456+00:00';
  assert.equal(validateVersion(version), version);
  assert.equal(validateDeleteVersion(`"${version}"`), version);
  for (const value of [null, '', 'yesterday', 'infinity', version.repeat(2), '2026-10-09']) assert.throws(() => validateVersion(value), (e) => e.status === 400);
  for (const header of ['*', version, `W/"${version}"`, `"${version}", "${version}"`]) assert.throws(() => validateDeleteVersion(header), (e) => e.status === 400);
  for (const body of [null, [], {}, { updatedAt: version }, { updatedAt: version, status: 'shipped' },
    { updatedAt: version, items: [] }, { updatedAt: version, customer: {} }]) assert.throws(() => validateOrderUpdate(body), (e) => e.status === 400);
  assert.deepEqual(validateOrderUpdate({ updatedAt: version, customer, status: 'cancelled' }).change, { customer, status: 'cancelled' });
});
