import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../app.js';
import { openDatabase } from '../database.js';

const productInput = {
  name: 'Test milk', category: 'Fresh Milk', price: 1234.5, stock: 7, description: 'Fresh test milk',
};

async function fixture(t, database = openDatabase(':memory:')) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    database.close();
  });
  return {
    database,
    async request(path, method = 'GET', body, headers = {}) {
      const response = await fetch(`${base}${path}`, {
        method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const json = response.status === 204 ? undefined : await response.json();
      return { status: response.status, headers: response.headers, body: json };
    },
    base,
  };
}

test('health, categories, seeded catalog, search, featured products and unknown routes', async (t) => {
  const { request } = await fixture(t);
  assert.deepEqual((await request('/api/health')).body, { status: 'ok' });
  assert.equal((await request('/api/categories')).body.data.length, 7);
  const list = await request('/api/products');
  assert.equal(list.body.data.length, 30);
  assert.equal(list.body.data[0].id, 'seed-almond-bliss');
  assert.equal(list.body.data[0].price, 299);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal(list.headers.get('x-powered-by'), null);
  const found = await request('/api/products?q=ALMOND');
  assert.equal(found.body.data.length, 1);
  assert.equal(found.body.data[0].name, 'Almond Bliss');
  assert.equal((await request('/api/products?featured=true')).body.data.length, 9);
  assert.equal((await request('/api/products?category=Unsupported')).status, 400);
  assert.equal((await request('/api/products?q=a&q=b')).status, 400);
  assert.equal((await request('/api/products?featured=yes')).status, 400);
  assert.equal((await request('/api/products?q=' + encodeURIComponent("' OR 1=1 --"))).body.data.length, 0);
  assert.equal((await request('/api/products/missing')).status, 404);
  assert.equal((await request('/api/unknown')).status, 404);
});

test('create, read from another request, replace and delete products with exact prices', async (t) => {
  const { request } = await fixture(t);
  const created = await request('/api/products', 'POST', { ...productInput, name: '  Test milk  ' });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.match(id, /^custom-/);
  assert.equal(created.body.data.name, 'Test milk');
  assert.equal(created.body.data.price, 1234.5);
  assert.equal(created.headers.get('location'), `/api/products/${id}`);
  assert.equal((await request(`/api/products/${id}`)).body.data.stock, 7);
  assert.equal((await request('/api/products?category=Fresh%20Milk')).body.data[0].id, id);
  assert.equal((await request('/api/products')).body.data[0].id, id);
  const updated = await request(`/api/products/${id}`, 'PUT', {
    ...productInput, price: 0.29, stock: null, photo: null, description: '',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.price, 0.29);
  assert.equal('stock' in updated.body.data, false);
  assert.equal('photo' in updated.body.data, false);
  assert.equal((await request(`/api/products/${id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/api/products/${id}`)).status, 404);
  assert.equal((await request(`/api/products/${id}`, 'DELETE')).status, 404);
  assert.equal((await request(`/api/products/${id}`, 'PUT', productInput)).status, 404);
});

test('invalid product input never changes stored data', async (t) => {
  const { request } = await fixture(t);
  const invalid = [
    null, [], {}, { ...productInput, name: ' ' }, { ...productInput, name: 'x'.repeat(61) },
    { ...productInput, price: 0 }, { ...productInput, price: -1 }, { ...productInput, price: '12' },
    { ...productInput, price: 1.234 }, { ...productInput, price: 1000000 },
    { ...productInput, stock: -1 }, { ...productInput, stock: 1.5 }, { ...productInput, stock: '2' },
    { ...productInput, stock: 1000000001 }, { ...productInput, category: '' },
    { ...productInput, category: 'Unknown' }, { ...productInput, description: 'x'.repeat(201) },
    { ...productInput, photo: 'javascript:alert(1)' }, { ...productInput, photo: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { ...productInput, photo: 'data:image/png;base64,aGVsbG8=' },
    { ...productInput, photo: 'assets/Products/../private.png' },
  ];
  for (const input of invalid) {
    const result = await request('/api/products', 'POST', input);
    assert.equal(result.status, 400, JSON.stringify(input));
    assert.equal(typeof result.body.error.message, 'string');
  }
  const invalidUpdate = await request('/api/products/seed-almond-bliss', 'PUT', { ...productInput, price: -1 });
  assert.equal(invalidUpdate.status, 400);
  assert.equal((await request('/api/products/seed-almond-bliss')).body.data.price, 299);
  assert.equal((await request('/api/products')).body.data.length, 30);
});

test('accepts image uploads and existing catalog photos', async (t) => {
  const { request } = await fixture(t);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=';
  for (const photo of [png, 'assets/Products/AlmondBliss.webp', 'https://example.com/milk.jpg']) {
    const result = await request('/api/products', 'POST', { ...productInput, photo });
    assert.equal(result.status, 201);
    assert.equal(result.body.data.photo, photo);
  }
});

test('legacy seeded products can still be edited without inventing a category', async (t) => {
  const { request } = await fixture(t);
  const result = await request('/api/products/seed-almond-bliss', 'PUT', { ...productInput, category: '' });
  assert.equal(result.status, 200);
  assert.equal('category' in result.body.data, false);
  await request('/api/products/seed-almond-bliss', 'DELETE');
  const featured = (await request('/api/products?featured=true')).body.data;
  assert.equal(featured.length, 9);
  assert.equal(featured[0].id, 'seed-apple-drops');
});

test('reviews are shared, validated, ordered and deleted with their product', async (t) => {
  const { request, database } = await fixture(t);
  const id = (await request('/api/products', 'POST', productInput)).body.data.id;
  assert.deepEqual((await request(`/api/products/${id}/reviews`)).body.data, []);
  const review = await request(`/api/products/${id}/reviews`, 'POST', {
    name: '  Ana  ', rating: 5, comment: '  Very fresh.  ',
  });
  assert.equal(review.status, 201);
  assert.equal(review.body.data.name, 'Ana');
  assert.equal(review.body.data.comment, 'Very fresh.');
  assert.ok(Date.parse(review.body.data.createdAt));
  await request(`/api/products/${id}/reviews`, 'POST', { name: 'Ben', rating: 4, comment: 'Good milk.' });
  const reviews = (await request(`/api/products/${id}/reviews`)).body.data;
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].name, 'Ben');
  for (const invalid of [
    { name: '', rating: 5, comment: 'Good' }, { name: 'Ana', rating: 0, comment: 'Good' },
    { name: 'Ana', rating: 6, comment: 'Good' }, { name: 'Ana', rating: 2.5, comment: 'Good' },
    { name: 'Ana', rating: '5', comment: 'Good' }, { name: 'Ana', rating: 5, comment: ' ' },
    { name: 'Ana', rating: 5, comment: 'x'.repeat(501) },
  ]) assert.equal((await request(`/api/products/${id}/reviews`, 'POST', invalid)).status, 400);
  assert.equal((await request('/api/products/missing/reviews', 'POST', { name: 'Ana', rating: 5, comment: 'Good' })).status, 404);
  await request(`/api/products/${id}`, 'DELETE');
  assert.equal((await request(`/api/products/${id}/reviews`)).status, 404);
  assert.deepEqual(database.listReviews(id), []);
});

test('CORS allows configured origins and rejects other browser origins', async (t) => {
  const { request } = await fixture(t);
  const allowed = await request('/api/products', 'GET', undefined, { Origin: 'http://localhost:3000' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const preflight = await request('/api/products', 'OPTIONS', undefined, {
    Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST',
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, If-Match');
  const denied = await request('/api/products', 'POST', productInput, { Origin: 'https://untrusted.example' });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('malformed JSON, wrong content types and oversized bodies return readable API errors', async (t) => {
  const { base } = await fixture(t);
  for (const [body, contentType, expected] of [
    ['{"name":', 'application/json', 400],
    ['plain text', 'text/plain', 415],
    [JSON.stringify({ photo: 'x'.repeat(8 * 1024 * 1024) }), 'application/json', 413],
  ]) {
    const response = await fetch(`${base}/api/products`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    assert.equal(response.status, expected);
    assert.equal(typeof (await response.json()).error.message, 'string');
  }
});

test('unexpected server errors do not leak database or internal error details', async (t) => {
  const errors = [];
  const app = createApp({ healthy() { throw new Error('private-database-path'); } }, { logError: (error) => errors.push(error) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { message: 'The server could not complete the request.' } });
  assert.equal(errors.length, 1);
});

test('reopening a database preserves edits, new products, reviews and deletions without reseeding', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dairydash-api-test-'));
  const path = join(directory, 'catalog.sqlite');
  let db;
  try {
    db = openDatabase(path);
    const input = { ...productInput, priceCents: 123450, photo: null };
    const product = db.createProduct(input);
    db.updateProduct('seed-almond-bliss', { ...input, name: 'Edited almond' });
    db.deleteProduct('seed-apple-drops');
    db.createReview(product.id, { name: 'Ana', rating: 5, comment: 'Still here after restart.' });
    db.close();
    db = openDatabase(path);
    assert.equal(db.listProducts().length, 30);
    assert.equal(db.getProduct(product.id).price, 1234.5);
    assert.equal(db.getProduct('seed-almond-bliss').name, 'Edited almond');
    assert.equal(db.getProduct('seed-apple-drops'), undefined);
    assert.equal(db.listReviews(product.id).length, 1);
    for (const item of db.listProducts()) db.deleteProduct(item.id);
    db.close();
    db = openDatabase(path);
    assert.deepEqual(db.listProducts(), []);
  } finally {
    db?.close();
    // Delete only this test's files; no recursive deletion of a computed path.
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});
