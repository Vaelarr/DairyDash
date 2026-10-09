import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createSupabaseClient } from '../../supabase-client.js';
import { openSupabaseDatabase } from '../../supabase-database.js';

// A local Postgres engine behind a Supabase HTTP test transport. The real SDK, SQL migration,
// constraints, RPCs and repository run here; no Supabase account or credentials are used.
export async function createSupabaseHarness() {
  const migrationDirectory = new URL('../../../supabase/migrations/', import.meta.url);
  const postgres = new PGlite();
  await postgres.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  for (const file of (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
    await postgres.exec(await readFile(new URL(file, migrationDirectory), 'utf8'));
  }
  const bucket = (await postgres.query('select * from storage.buckets')).rows[0];
  await postgres.exec('set role service_role');
  const objects = new Map();
  const warnings = [];
  const calls = [];
  const state = { failInsert: false, loseInsertResponse: false, loseOrderResponse: false, failRemove: false, failUpload: false, onUpload: null, bucketPublic: true };
  const tables = {
    dairydash_products: ['id', 'name', 'category', 'price_cents', 'stock', 'description', 'photo', 'photo_storage_path', 'catalog_position', 'created_at', 'updated_at'],
    dairydash_reviews: ['id', 'product_id', 'name', 'rating', 'comment', 'created_at', 'user_id', 'updated_at'],
    dairydash_settings: ['key', 'created_at'],
    dairydash_orders: ['id', 'user_id', 'request_id', 'request_hash', 'customer_name', 'customer_email', 'customer_phone', 'delivery_address', 'status', 'total_cents', 'created_at'],
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

  function column(table, name) {
    if (!tables[table]?.includes(name)) throw new Error(`Unexpected test column: ${name}`);
    return `"${name}"`;
  }
  function selected(table, query) {
    return (query.get('select') || '*').split(',').map((name) => name === '*' ? '*' : column(table, name)).join(',');
  }
  function filters(table, query, parameters) {
    const clauses = [];
    for (const [name, value] of query) {
      if (['select', 'order', 'limit', 'offset'].includes(name)) continue;
      if (!value.startsWith('eq.')) throw new Error('Unexpected test filter');
      parameters.push(value.slice(3));
      clauses.push(`${column(table, name)} = $${parameters.length}`);
    }
    return clauses.length ? ` where ${clauses.join(' and ')}` : '';
  }
  function pagination(table, query) {
    const ordering = query.get('order')?.split(',').map((part) => {
      const [name, direction, nulls] = part.split('.');
      if (!['asc', 'desc'].includes(direction) || (nulls && !['nullsfirst', 'nullslast'].includes(nulls))) throw new Error('Unexpected test ordering');
      return `${column(table, name)} ${direction} ${nulls === 'nullsfirst' ? 'nulls first' : nulls === 'nullslast' ? 'nulls last' : ''}`;
    });
    const limit = Number(query.get('limit') ?? 1000);
    const offset = Number(query.get('offset') ?? 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) throw new Error('Unexpected test range');
    return `${ordering ? ' order by ' + ordering.join(',') : ''} limit ${limit} offset ${offset}`;
  }

  const fetchImplementation = async (input, init = {}) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    const method = init.method ?? 'GET';
    if (headers.get('apikey') !== 'sb_secret_test_only') throw new Error('SDK did not send the configured server API key');
    calls.push({ path: url.pathname, method });
    try {
      if (url.pathname.startsWith('/storage/v1/bucket/')) return json({ ...bucket, public: state.bucketPublic });
      if (url.pathname.startsWith('/storage/v1/object/')) {
        const prefix = `/storage/v1/object/${bucket.id}`;
        const path = decodeURIComponent(url.pathname.slice(prefix.length + 1));
        if (method === 'POST') {
          if (state.failUpload) return json({ statusCode: '400', message: 'Upload rejected' }, 400);
          const bytes = Buffer.from(await new Response(init.body).arrayBuffer());
          if (!bucket.allowed_mime_types.includes(headers.get('content-type')) || bytes.length > bucket.file_size_limit) {
            return json({ statusCode: '400', message: 'Invalid image size or type' }, 400);
          }
          objects.set(path, bytes);
          if (state.onUpload) await state.onUpload(path);
          return json({ Key: `${bucket.id}/${path}`, Id: 'test-object-id' });
        }
        if (method === 'DELETE') {
          if (state.failRemove) return json({ statusCode: '400', message: 'Cleanup rejected' }, 400);
          const { prefixes } = JSON.parse(init.body);
          for (const path of prefixes) objects.delete(path);
          return json(prefixes.map((name) => ({ name })));
        }
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const body = JSON.parse(init.body || '{}');
        if (url.pathname.endsWith('/dairydash_manage_review')) {
          const result = await postgres.query('select public.dairydash_manage_review($1::uuid, $2, $3::uuid, $4::boolean, $5::timestamptz, $6::jsonb, $7::boolean) as result',
            [body.review_id, body.product_id, body.actor_id, body.actor_is_admin, body.expected_updated_at, JSON.stringify(body.change), body.delete_review]);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_manage_order')) {
          const result = await postgres.query('select public.dairydash_manage_order($1::uuid, $2::uuid, $3::boolean, $4::timestamptz, $5::jsonb, $6::boolean) as result',
            [body.order_id, body.actor_id, body.actor_is_admin, body.expected_updated_at, JSON.stringify(body.change), body.delete_order]);
          if (state.loseOrderResponse) return json({ code: 'TEST_LOST_RESPONSE', message: 'Response lost after commit' }, 400);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_admin_get_order')) {
          const result = await postgres.query('select public.dairydash_admin_get_order($1::uuid) as result', [body.order_id]);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_admin_list_orders')) {
          const limit = Number(url.searchParams.get('limit') ?? 1000);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          const result = await postgres.query('select result from public.dairydash_admin_list_orders() as result limit $1 offset $2', [limit, offset]);
          return json(result.rows.map((row) => row.result));
        }
        if (url.pathname.endsWith('/dairydash_create_order')) {
          const result = await postgres.query('select public.dairydash_create_order($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb) as result',
            [body.customer_id, body.checkout_id, body.payload_hash, JSON.stringify(body.customer), JSON.stringify(body.lines)]);
          if (state.loseOrderResponse) return json({ code: 'TEST_LOST_RESPONSE', message: 'Response lost after commit' }, 400);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_get_order')) {
          const result = await postgres.query('select public.dairydash_get_order($1::uuid, $2::uuid) as result', [body.order_id, body.customer_id]);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_list_orders')) {
          const limit = Number(url.searchParams.get('limit') ?? 1000);
          const offset = Number(url.searchParams.get('offset') ?? 0);
          const result = await postgres.query('select result from public.dairydash_list_orders($1::uuid) as result limit $2 offset $3',
            [body.customer_id, limit, offset]);
          return json(result.rows.map((row) => row.result));
        }
        if (url.pathname.endsWith('/dairydash_seed_catalog')) {
          const result = await postgres.query('select public.dairydash_seed_catalog($1::jsonb) as result', [JSON.stringify(body.catalog)]);
          return json(result.rows[0].result);
        }
        if (url.pathname.endsWith('/dairydash_list_products')) {
          const result = await postgres.query(`select * from public.dairydash_list_products($1, $2, $3)
            ${pagination('dairydash_products', url.searchParams)}`, [body.search_text, body.category_filter, body.featured_only]);
          return json(result.rows);
        }
      }
      const table = url.pathname.split('/').at(-1);
      if (!tables[table]) throw new Error(`Unexpected test route: ${url.pathname}`);
      const parameters = [];
      let sql;
      if (method === 'GET') {
        sql = `select ${selected(table, url.searchParams)} from public.${table}${filters(table, url.searchParams, parameters)}${pagination(table, url.searchParams)}`;
      } else if (method === 'POST') {
        if (state.failInsert && table === 'dairydash_products') return json({ code: '23514', message: 'Private database diagnostic' }, 400);
        const body = JSON.parse(init.body);
        const columns = Object.keys(body);
        parameters.push(...Object.values(body));
        sql = `insert into public.${table} (${columns.map((name) => column(table, name)).join(',')})
          values (${parameters.map((_, index) => '$' + (index + 1)).join(',')}) returning ${selected(table, url.searchParams)}`;
      } else if (method === 'PATCH') {
        const body = JSON.parse(init.body);
        const changes = Object.entries(body).map(([name, value]) => {
          parameters.push(value);
          return `${column(table, name)} = $${parameters.length}`;
        });
        sql = `update public.${table} set ${changes.join(',')}${filters(table, url.searchParams, parameters)} returning ${selected(table, url.searchParams)}`;
      } else if (method === 'DELETE') {
        sql = `delete from public.${table}${filters(table, url.searchParams, parameters)} returning ${selected(table, url.searchParams)}`;
      } else throw new Error('Unexpected test method');
      const { rows } = await postgres.query(sql, parameters);
      if (state.loseInsertResponse && method === 'POST' && table === 'dairydash_products') {
        return json({ code: 'TEST_LOST_RESPONSE', message: 'Response lost after commit' }, 400);
      }
      if (headers.get('accept') === 'application/vnd.pgrst.object+json') {
        return rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'Expected one row' }, 406);
      }
      return json(rows);
    } catch (error) {
      return json({ code: error.code ?? 'TEST_TRANSPORT', message: error.message }, 400);
    }
  };
  const client = createSupabaseClient({ projectUrl: 'https://dairydash-test.supabase.co', secretKey: 'sb_secret_test_only' }, fetchImplementation);
  const database = openSupabaseDatabase(client, { logWarning: (message) => warnings.push(message) });
  return {
    database, postgres, objects, warnings, calls, state,
    async reset() {
      await postgres.exec('reset role; truncate public.dairydash_products, public.dairydash_reviews, public.dairydash_settings, public.dairydash_orders, public.dairydash_order_items; set role service_role;');
      objects.clear(); warnings.length = 0; calls.length = 0;
      Object.assign(state, { failInsert: false, loseInsertResponse: false, loseOrderResponse: false, failRemove: false, failUpload: false, onUpload: null, bucketPublic: true });
    },
    close: () => postgres.close(),
  };
}
