import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createVercelHandler } from '../vercel.js';

const nativeFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: 'https://dairydash-test.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test_only',
  VERCEL_PROJECT_PRODUCTION_URL: 'dairy-dash.vercel.app',
  VERCEL_URL: 'dairy-dash-preview.vercel.app',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_PROVIDER: 'sqlite',
};

async function fixture(t, configuration = env) {
  const server = createServer(createVercelHandler(configuration)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return (path, options = {}) => nativeFetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

test('Vercel serves nested catalog routes and query filters as cloud JSON', async (t) => {
  const row = {
    id: 'seed-test-milk', name: 'Test milk', category: null, price_cents: 29900,
    stock: null, description: 'Fresh', photo: null,
  };
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    assert.equal(new Headers(init.headers).get('apikey'), env.SUPABASE_SECRET_KEY);
    const url = new URL(input);
    if (url.pathname.endsWith('/dairydash_list_products')) {
      assert.equal(JSON.parse(init.body).search_text, 'milk');
      assert.equal(JSON.parse(init.body).featured_only, true);
      reads++;
      return Response.json([row]);
    }
    assert.equal(url.pathname, '/rest/v1/dairydash_products');
    assert.equal(url.searchParams.get('id'), 'eq.seed-test-milk');
    reads++;
    return Response.json(row);
  });
  const request = await fixture(t);
  const list = await request('/api/products?q=milk&featured=true');
  assert.equal(list.status, 200);
  assert.match(list.headers.get('content-type'), /application\/json/);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal((await list.json()).data[0].price, 299);
  const detail = await request('/api/products/seed-test-milk');
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).data.id, row.id);
  assert.equal(reads, 2);
});

test('Vercel accepts trusted deployment origins and rejects unrelated origins', async (t) => {
  const request = await fixture(t);
  for (const origin of ['https://dairy-dash.vercel.app', 'https://dairy-dash-preview.vercel.app', 'https://localhost']) {
    const response = await request('/api/categories', { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const denied = await request('/api/categories', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.status, 403);
});

test('Vercel requires authentication for writes and private reads even with a SQLite setting', async (t) => {
  const request = await fixture(t);
  const write = await request('/api/products', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Milk' }),
  });
  assert.equal(write.status, 401);
  assert.equal((await request('/api/orders')).status, 401);
  const unknown = await request('/api/missing');
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/);
});

test('Vercel reports missing server configuration as JSON without exposing secrets', async (t) => {
  t.mock.method(console, 'error', () => {});
  const request = await fixture(t, { SUPABASE_SECRET_KEY: 'sb_secret_do_not_expose' });
  const response = await request('/api/products');
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.match(JSON.parse(body).error.message, /SUPABASE_URL and SUPABASE_SECRET_KEY/);
  assert.ok(!body.includes('sb_secret_do_not_expose'));
});
