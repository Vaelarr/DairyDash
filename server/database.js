import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SEED_PRODUCTS } from '../src/app/data/seed-products.ts';
import { ApiError } from './errors.js';

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
  if (version > 3) {
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

  if (version < 2) {
    try {
      db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE orders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents >= 0), created_at TEXT NOT NULL,
        UNIQUE(user_id, request_id)
      ) STRICT;
      CREATE INDEX orders_by_user ON orders(user_id, created_at DESC, id DESC);
      CREATE TABLE order_items (
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, line_number INTEGER NOT NULL,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents BETWEEN 1 AND 99999999),
        quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99), PRIMARY KEY(order_id, line_number)
      ) STRICT;
      PRAGMA user_version = 2; COMMIT;`);
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }

  if (version < 3) {
    try {
      db.exec(`BEGIN IMMEDIATE;
        ALTER TABLE reviews ADD COLUMN user_id TEXT;
        ALTER TABLE reviews ADD COLUMN updated_at TEXT;
        UPDATE reviews SET updated_at = created_at;
        ALTER TABLE orders ADD COLUMN updated_at TEXT;
        UPDATE orders SET updated_at = created_at;
        ALTER TABLE orders ADD COLUMN deleted_at TEXT;
        ALTER TABLE order_items ADD COLUMN stock_deducted INTEGER CHECK(stock_deducted IN (0, 1));
        PRAGMA user_version = 3; COMMIT;`);
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  }

  const find = db.prepare('SELECT * FROM products WHERE id = ?');
  const reviewColumns = 'id, name, rating, comment, user_id AS userId, created_at AS createdAt, updated_at AS updatedAt';
  const findReview = db.prepare(`SELECT ${reviewColumns} FROM reviews WHERE id = ?`);
  const nextVersion = (previous) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
  function orderFromRow(row) {
    if (!row) return undefined;
    return {
      id: row.id, status: row.status, total: row.total_cents / 100, createdAt: row.created_at, updatedAt: row.updated_at,
      customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone, address: row.delivery_address },
      items: db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY line_number').all(row.id).map((item) => ({
        productId: item.product_id, name: item.product_name, price: item.unit_price_cents / 100,
        quantity: item.quantity, total: item.unit_price_cents * item.quantity / 100,
      })),
    };
  }
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
    listReviews: (id) => db.prepare(`SELECT ${reviewColumns}
      FROM reviews WHERE product_id = ? ORDER BY created_at DESC, rowid DESC`).all(id),
    getReview: (productId, id) => db.prepare(`SELECT ${reviewColumns} FROM reviews WHERE product_id = ? AND id = ?`).get(productId, id),
    createReview(productId, input, userId = null) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO reviews (id, product_id, name, rating, comment, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, productId, input.name, input.rating, input.comment, userId, now, now);
      return findReview.get(id);
    },
    manageReview(productId, id, actor, updatedAt, change, remove = false) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const saved = db.prepare('SELECT * FROM reviews WHERE product_id = ? AND id = ?').get(productId, id);
        if (!saved) { db.exec('COMMIT'); return undefined; }
        if (!actor.isAdmin && (!actor.id || saved.user_id !== actor.id)) throw new ApiError(403, 'Only the review author or an admin can change this review.');
        if (Date.parse(saved.updated_at) !== Date.parse(updatedAt)) throw new ApiError(409, 'This record changed. Reload it before saving or deleting.');
        let result;
        if (remove) {
          result = findReview.get(id);
          db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
        } else {
          db.prepare('UPDATE reviews SET name = ?, rating = ?, comment = ?, updated_at = ? WHERE id = ?')
            .run(change.name, change.rating, change.comment, nextVersion(saved.updated_at), id);
          result = findReview.get(id);
        }
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    getOrder: (id, userId) => orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, userId)),
    listOrders: (userId) => db.prepare('SELECT * FROM orders WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC').all(userId).map(orderFromRow),
    adminGetOrder: (id) => orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(id)),
    adminListOrders: () => db.prepare('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC').all().map(orderFromRow),
    manageOrder(id, actor, updatedAt, change, remove = false) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const saved = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(id);
        if (!saved || (!actor.isAdmin && saved.user_id !== actor.id)) { db.exec('COMMIT'); return undefined; }
        if (Date.parse(saved.updated_at) !== Date.parse(updatedAt)) throw new ApiError(409, 'This record changed. Reload it before saving or deleting.');
        let status = change.status ?? saved.status;
        if (remove && ['pending', 'confirmed'].includes(saved.status)) status = 'cancelled';
        if (!actor.isAdmin && ((remove && !['pending', 'cancelled'].includes(saved.status)) ||
            (!remove && (saved.status !== 'pending' || !['pending', 'cancelled'].includes(status))))) {
          throw new ApiError(409, 'This order cannot be changed at its current stage.');
        }
        if ((change.customer && !['pending', 'confirmed'].includes(saved.status)) ||
            (status !== saved.status && !((saved.status === 'pending' && ['confirmed', 'cancelled'].includes(status)) ||
              (saved.status === 'confirmed' && ['completed', 'cancelled'].includes(status))))) {
          throw new ApiError(409, 'This order cannot be changed at its current stage.');
        }
        if (['pending', 'confirmed'].includes(saved.status) && status === 'cancelled') {
          const reservations = db.prepare(`SELECT p.id, p.stock, i.quantity, i.stock_deducted FROM order_items i
            JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY p.id`).all(id);
          for (const item of reservations) {
            if (item.stock === null) continue;
            if (item.stock_deducted === null || (item.stock_deducted && item.stock + item.quantity > 1000000000)) {
              throw new ApiError(409, 'Stock restoration needs an administrator to verify the inventory reservation.');
            }
            if (item.stock_deducted) db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?')
              .run(item.quantity, new Date().toISOString(), item.id);
          }
        }
        const customer = change.customer ?? { name: saved.customer_name, email: saved.customer_email, phone: saved.customer_phone, address: saved.delivery_address };
        db.prepare(`UPDATE orders SET status = ?, customer_name = ?, customer_email = ?, customer_phone = ?, delivery_address = ?,
          updated_at = ?, deleted_at = ? WHERE id = ?`).run(status, customer.name, customer.email, customer.phone, customer.address,
            nextVersion(saved.updated_at), remove ? new Date().toISOString() : null, id);
        const result = orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    createOrder(userId, input) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = db.prepare('SELECT * FROM orders WHERE user_id = ? AND request_id = ?').get(userId, input.requestId);
        if (previous) {
          if (previous.deleted_at) throw new ApiError(409, 'This checkout order was deleted. Start a new checkout request.', undefined, 'CHECKOUT_DELETED');
          if (previous.request_hash !== input.requestHash) throw new ApiError(409, 'This checkout request was already used for a different order.');
          const order = orderFromRow(previous);
          db.exec('COMMIT');
          return order;
        }
        const id = randomUUID();
        db.prepare(`INSERT INTO orders (id, user_id, request_id, request_hash, customer_name, customer_email,
          customer_phone, delivery_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            id, userId, input.requestId, input.requestHash, input.customer.name, input.customer.email,
            input.customer.phone, input.customer.address, new Date().toISOString(), new Date().toISOString()
          );
        let totalCents = 0;
        for (const [index, item] of input.items.entries()) {
          const product = find.get(item.productId);
          if (!product) throw new ApiError(409, 'A product is no longer available. Review your cart.');
          if (product.price_cents !== item.priceCents) throw new ApiError(409, 'A product price changed. Refresh your cart before placing the order.');
          if (product.stock !== null && product.stock < item.quantity) {
            throw new ApiError(409, 'There is not enough stock for this order. Review your quantities.');
          }
          db.prepare(`INSERT INTO order_items (order_id, line_number, product_id, product_name, unit_price_cents, quantity, stock_deducted)
            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, index, product.id, product.name, product.price_cents, item.quantity, product.stock !== null ? 1 : 0);
          totalCents += product.price_cents * item.quantity;
          if (product.stock !== null) db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?')
            .run(item.quantity, new Date().toISOString(), product.id);
        }
        db.prepare('UPDATE orders SET total_cents = ? WHERE id = ?').run(totalCents, id);
        const order = orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
        db.exec('COMMIT');
        return order;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
