import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_PRODUCTS } from '../src/app/data/seed-products.ts';

function productFromRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    price: row.price_cents / 100,
    description: row.description,
    ...(row.category !== null ? { category: row.category } : {}),
    ...(row.stock !== null ? { stock: row.stock } : {}),
    ...(row.photo !== null ? { photo: row.photo } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) {
    db.close();
    throw new Error('This database requires a newer version of the API.');
  }
  if (version === 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
          category TEXT,
          price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 1 AND 99999999),
          stock INTEGER CHECK(stock IS NULL OR (stock >= 0 AND stock <= 1000000000)),
          description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 200),
          photo TEXT,
          catalog_position INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE reviews (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
          rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
          comment TEXT NOT NULL CHECK(length(trim(comment)) BETWEEN 1 AND 500),
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX reviews_by_product ON reviews(product_id, created_at DESC);
      `);
      const insert = db.prepare(`INSERT INTO products
        (id, name, category, price_cents, stock, description, photo, catalog_position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const now = new Date().toISOString();
      SEED_PRODUCTS.forEach((product, position) => insert.run(
        product.id, product.name, product.category ?? null,
        Math.round(Number(product.price.replace(/[^\d.]/g, '')) * 100),
        product.stock ?? null, product.description, product.photo ?? null, position, now, now
      ));
      db.exec('PRAGMA user_version = 1; COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }

  const find = db.prepare('SELECT * FROM products WHERE id = ?');
  const findReview = db.prepare('SELECT id, name, rating, comment, created_at AS createdAt FROM reviews WHERE id = ?');
  return {
    close: () => db.close(),
    healthy: () => db.prepare('SELECT 1 AS ok').get().ok === 1,
    getProduct: (id) => productFromRow(find.get(id)),
    listProducts({ search = '', category = '', featured = false } = {}) {
      return db.prepare(`SELECT * FROM products
        WHERE (? = '' OR instr(lower(name), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0)
          AND (? = '' OR category = ?)
          AND (? = 0 OR catalog_position IS NOT NULL)
        ORDER BY (catalog_position IS NOT NULL), catalog_position ASC, created_at DESC, rowid DESC
        ${featured ? 'LIMIT 9' : ''}`).all(search, search, search, category, category, featured ? 1 : 0)
        .map(productFromRow);
    },
    createProduct(input) {
      const id = `custom-${randomUUID()}`;
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO products
        (id, name, category, price_cents, stock, description, photo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id, input.name, input.category, input.priceCents, input.stock, input.description, input.photo, now, now
        );
      return productFromRow(find.get(id));
    },
    updateProduct(id, input) {
      db.prepare(`UPDATE products SET name = ?, category = ?, price_cents = ?, stock = ?,
        description = ?, photo = ?, updated_at = ? WHERE id = ?`).run(
          input.name, input.category, input.priceCents, input.stock, input.description, input.photo,
          new Date().toISOString(), id
        );
      return productFromRow(find.get(id));
    },
    deleteProduct: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0,
    listReviews: (id) => db.prepare(`SELECT id, name, rating, comment, created_at AS createdAt
      FROM reviews WHERE product_id = ? ORDER BY created_at DESC, rowid DESC`).all(id),
    createReview(productId, input) {
      const id = randomUUID();
      db.prepare(`INSERT INTO reviews (id, product_id, name, rating, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(id, productId, input.name, input.rating, input.comment, new Date().toISOString());
      return findReview.get(id);
    },
  };
}
