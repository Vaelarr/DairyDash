import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { checkoutOptions } from '../checkout.js';
import { openDatabase } from '../database.js';
import { validateOrder, validateProduct } from '../validation.js';
import { createSupabaseHarness } from './helpers/supabase-harness.js';

const owner = { id: randomUUID(), isAdmin: false };
const admin = { id: randomUUID(), isAdmin: true };
const customer = { name: 'Ana Cruz', email: 'ana@example.com', phone: '09123456789', address: '123 Farm Street' };
const shippingAddress = { line1: '123 Farm Street', line2: 'Unit 2', barangay: 'San Antonio', city: 'Pasig', province: 'Metro Manila', postalCode: '1600', country: 'PH' };
const options = checkoutOptions({ CHECKOUT_DELIVERY_FEE: '49.99', PAYMENT_GCASH_INSTRUCTIONS: 'Transfer to Dairy Dash, 09123456789. Include your order reference.' });
const body = (productId, paymentMethod = 'gcash') => ({ requestId: randomUUID(), customer, shippingAddress, paymentMethod,
  deliveryNotes: 'Call at the gate', deliveryFee: 49.99, items: [{ productId, quantity: 3, price: 0.29 }] });
const conflict = (error) => error.status === 409;
let harness;
before(async () => { harness = await createSupabaseHarness(); });
beforeEach(async () => { await harness.reset(); });
after(async () => { await harness?.close(); });

test('checkout configuration enables only methods with instructions and validates fees', () => {
  const defaults = checkoutOptions();
  assert.equal(defaults.deliveryFee, 0);
  assert.deepEqual(defaults.paymentMethods.filter((method) => method.enabled).map((method) => method.id), ['cash_on_delivery']);
  assert.equal(options.paymentMethods.find((method) => method.id === 'gcash').enabled, true);
  for (const fee of ['-1', 'NaN', '1.001', '1000000']) assert.throws(() => checkoutOptions({ CHECKOUT_DELIVERY_FEE: fee }));
});

test('checkout validates structured addresses, configured payments, notes and fee quotes', () => {
  const valid = body('milk');
  for (const invalid of [
    { ...valid, paymentMethod: 'card' }, { ...valid, paymentMethod: 'maya' }, { ...valid, paymentMethod: null },
    { ...valid, shippingAddress: null }, { ...valid, shippingAddress: [] },
    ...['line1', 'barangay', 'city', 'province'].map((key) => ({ ...valid, shippingAddress: { ...shippingAddress, [key]: ' ' } })),
    { ...valid, shippingAddress: { ...shippingAddress, postalCode: '123' } },
    { ...valid, shippingAddress: { ...shippingAddress, country: 'US' } },
    { ...valid, deliveryNotes: 'x'.repeat(301) }, { ...valid, deliveryNotes: null },
    { ...valid, customer: { ...customer, phone: '-------' } },
  ]) assert.throws(() => validateOrder(invalid, options), (error) => error.status === 400);
  assert.throws(() => validateOrder({ ...valid, deliveryFee: 0 }, options), conflict);
  const input = validateOrder(valid, options);
  assert.equal(input.checkout.deliveryFeeCents, 4999);
  assert.equal(input.customer.address, '123 Farm Street, Unit 2, San Antonio, Pasig, Metro Manila, 1600, Philippines');
  assert.equal(input.checkout.paymentInstructions, options.paymentMethods.find((method) => method.id === 'gcash').instructions);
  for (const changed of [ { paymentMethod: 'cash_on_delivery' }, { deliveryNotes: 'Different gate' },
    { shippingAddress: { ...shippingAddress, line2: 'Unit 3' } } ]) {
    assert.notEqual(validateOrder({ ...valid, ...changed }, options).requestHash, input.requestHash);
  }
});

for (const provider of ['sqlite', 'supabase']) {
  async function fixture(t, method = 'gcash') {
    const db = provider === 'sqlite' ? openDatabase(':memory:') : harness.database;
    if (provider === 'sqlite') t.after(() => db.close());
    const product = await db.createProduct(validateProduct({ name: 'Milk', category: 'Fresh Milk', price: 0.29, stock: 10 }));
    const payload = body(product.id, method);
    const input = validateOrder(payload, options);
    const order = await db.createOrder(owner.id, input);
    return { db, product, payload, input, order };
  }

  test(`${provider}: saves delivery and payment snapshots with server totals and stable retries`, async (t) => {
    const { db, product, payload, order } = await fixture(t);
    assert.equal(order.subtotal, 0.87); assert.equal(order.deliveryFee, 49.99); assert.equal(order.total, 50.86);
    assert.equal(order.payment.method, 'gcash'); assert.equal(order.payment.status, 'unpaid');
    assert.deepEqual(order.delivery.address, shippingAddress); assert.equal(order.delivery.notes, 'Call at the gate');
    const changedInstructions = checkoutOptions({ CHECKOUT_DELIVERY_FEE: '49.99', PAYMENT_GCASH_INSTRUCTIONS: 'New merchant instructions' });
    assert.deepEqual(await db.createOrder(owner.id, validateOrder(payload, changedInstructions)), order);
    assert.equal((await db.getProduct(product.id)).stock, 7);
    await assert.rejects(async () => db.createOrder(owner.id, validateOrder({ ...payload, paymentMethod: 'cash_on_delivery' }, options)), conflict);
    const edited = await db.manageOrder(order.id, owner, order.updatedAt, { customer: { ...order.customer, address: 'Updated street address' } });
    assert.equal(edited.delivery.address, null); assert.equal(edited.payment.instructions, order.payment.instructions);
    assert.equal(edited.total, order.total);
  });

  test(`${provider}: prepaid fulfillment requires verified payment and sequential stages`, async (t) => {
    const { db, order: created } = await fixture(t);
    await assert.rejects(async () => db.manageOrder(created.id, owner, created.updatedAt, { paymentStatus: 'paid' }), conflict);
    await assert.rejects(async () => db.manageOrder(created.id, admin, created.updatedAt, { status: 'preparing' }), conflict);
    let order = await db.manageOrder(created.id, admin, created.updatedAt, { status: 'confirmed' });
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, { status: 'preparing' }), conflict);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { paymentStatus: 'paid' });
    await assert.rejects(async () => db.manageOrder(order.id, admin, created.updatedAt, { status: 'preparing' }), conflict);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'preparing' });
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, { customer }), conflict);
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, { status: 'completed' }), conflict);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'out_for_delivery' });
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'completed' });
    assert.equal(order.payment.status, 'paid'); assert.equal(order.status, 'completed');
  });

  test(`${provider}: COD can be prepared unpaid but delivery must record collection`, async (t) => {
    const { db, order: created } = await fixture(t, 'cash_on_delivery');
    let order = created;
    for (const status of ['confirmed', 'preparing', 'out_for_delivery']) order = await db.manageOrder(order.id, admin, order.updatedAt, { status });
    assert.equal(order.payment.status, 'unpaid');
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, { status: 'completed' }), conflict);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'completed', paymentStatus: 'paid' });
    assert.equal(order.status, 'completed'); assert.equal(order.payment.status, 'paid');
  });

  test(`${provider}: paid cancellation restores inventory once and keeps refunds visible`, async (t) => {
    const { db, product, order: created } = await fixture(t);
    let order = await db.manageOrder(created.id, admin, created.updatedAt, { paymentStatus: 'paid' });
    await assert.rejects(async () => db.manageOrder(order.id, owner, order.updatedAt, {}, true), conflict);
    assert.equal((await db.getProduct(product.id)).stock, 7);
    assert.equal((await db.getOrder(order.id, owner.id)).status, 'pending');
    order = await db.manageOrder(order.id, owner, order.updatedAt, { status: 'cancelled' });
    assert.equal(order.payment.status, 'refund_pending'); assert.equal((await db.getProduct(product.id)).stock, 10);
    await assert.rejects(async () => db.manageOrder(order.id, admin, order.updatedAt, {}, true), conflict);
    await assert.rejects(async () => db.manageOrder(order.id, owner, order.updatedAt, { paymentStatus: 'refunded' }), conflict);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { status: 'cancelled' });
    assert.equal(order.payment.status, 'refund_pending'); assert.equal((await db.getProduct(product.id)).stock, 10);
    order = await db.manageOrder(order.id, admin, order.updatedAt, { paymentStatus: 'refunded' });
    await db.manageOrder(order.id, owner, order.updatedAt, {}, true);
    assert.ok(!await db.getOrder(order.id, owner.id)); assert.equal((await db.getProduct(product.id)).stock, 10);
  });
}

test('checkout HTTP rejects unavailable methods and forged payment confirmation', async (t) => {
  const db = openDatabase(':memory:');
  const server = createApp(db, { checkout: options, authenticate: async (token) => ({ id: owner.id, app_metadata: token === 'admin' ? { role: 'admin' } : {} }) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); db.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method, payload, token = 'customer') => fetch(url + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const metadata = await fetch(url + '/checkout/options');
  assert.equal(metadata.status, 200); assert.deepEqual((await metadata.json()).data, options);
  const product = db.createProduct(validateProduct({ name: 'Milk', category: 'Fresh Milk', price: 0.29, stock: 10 }));
  assert.equal((await request('/orders', 'POST', body(product.id, 'maya'))).status, 400);
  const response = await request('/orders', 'POST', { ...body(product.id), total: 0, paymentStatus: 'paid', paymentInstructions: 'Forged merchant', deliveryFeeCents: 0 });
  assert.equal(response.status, 201);
  const order = (await response.json()).data;
  assert.equal(order.total, 50.86); assert.equal(order.payment.status, 'unpaid');
  assert.notEqual(order.payment.instructions, 'Forged merchant');
  assert.equal((await request(`/orders/${order.id}`, 'PUT', { updatedAt: order.updatedAt, paymentStatus: 'paid' })).status, 409);
  assert.equal((await request(`/admin/orders/${order.id}`, 'PUT', { updatedAt: order.updatedAt, paymentStatus: 'paid' })).status, 403);
});

test('checkout migration is repeatable and new RPC remains private to the API', async () => {
  const db = harness.database;
  const product = await db.createProduct(validateProduct({ name: 'Milk', category: 'Fresh Milk', price: 0.29, stock: 10 }));
  const order = await db.createOrder(owner.id, validateOrder(body(product.id), options));
  const migration = await readFile(new URL('../../supabase/migrations/202610090002_checkout_workflow.sql', import.meta.url), 'utf8');
  await harness.postgres.exec('reset role');
  await harness.postgres.exec(migration);
  await harness.postgres.exec('set role service_role');
  assert.deepEqual(await db.getOrder(order.id, owner.id), order);
  for (const role of ['anon', 'authenticated']) {
    await harness.postgres.exec(`reset role; set role ${role}`);
    await assert.rejects(() => harness.postgres.query('select public.dairydash_create_order($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb)',
      [owner.id, randomUUID(), '0'.repeat(64), JSON.stringify(customer), '[]', '{}']), /permission denied/);
  }
  await harness.postgres.exec('reset role; set role service_role');
});
