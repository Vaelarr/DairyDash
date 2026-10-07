import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';

const PRODUCTS = 'dairydash_products';
const REVIEWS = 'dairydash_reviews';
const PAGE_SIZE = 500;

function checked(result) {
  if (result.error) {
    if (result.error.code === '23503') throw new ApiError(404, 'Product not found.');
    // Supabase's diagnostic details stay off the public API (including schema and project details).
    throw new ApiError(503, 'The cloud database or storage is unavailable. Check the Supabase configuration and try again.');
  }
  return result.data;
}

function productFromRow(row) {
  if (!row) return undefined;
  return {
    id: row.id, name: row.name, price: row.price_cents / 100, description: row.description,
    ...(row.category !== null ? { category: row.category } : {}),
    ...(row.stock !== null ? { stock: row.stock } : {}),
    ...(row.photo !== null ? { photo: row.photo } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function reviewFromRow(row) {
  return { id: row.id, name: row.name, rating: row.rating, comment: row.comment, createdAt: row.created_at };
}

async function allPages(query) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = checked(await query().range(offset, offset + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** The same repository contract as SQLite, with asynchronous cloud operations. */
export function openSupabaseDatabase(client, { bucket = 'dairydash-product-images', logWarning = console.warn } = {}) {
  const storage = client.storage.from(bucket);
  const findRow = async (id) => checked(await client.from(PRODUCTS).select('*').eq('id', id).maybeSingle());

  async function uploadPhoto(photo, id, existing) {
    if (photo === existing?.photo) return { photo, path: existing.photo_storage_path, uploaded: false };
    if (!photo?.startsWith('data:image/')) return { photo: photo ?? null, path: null, uploaded: false };
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(photo);
    if (!match) throw new ApiError(400, 'Choose a valid product image.');
    return uploadBytes(Buffer.from(match[2], 'base64'), `image/${match[1]}`, id);
  }

  async function uploadBytes(bytes, contentType, id) {
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
    const path = `products/${id}/${randomUUID()}.${extension}`;
    checked(await storage.upload(path, bytes, { contentType, cacheControl: '31536000', upsert: false }));
    return { photo: storage.getPublicUrl(path).data.publicUrl, path, uploaded: true };
  }

  async function removeFiles(paths) {
    if (!paths.length) return;
    try {
      checked(await storage.remove(paths));
    } catch {
      // The database write already succeeded. A cleanup failure must not report a failed save/delete.
      logWarning('Supabase image cleanup failed; unused objects may remain in the product image bucket.');
    }
  }

  async function cleanFailedUpload(id, image) {
    if (!image.uploaded) return;
    try {
      // A lost response may follow a successful commit. Never remove an image still referenced by a row.
      const current = await findRow(id);
      if (current?.photo_storage_path !== image.path) await removeFiles([image.path]);
    } catch {
      logWarning('Could not verify an interrupted image save; its Storage object was retained.');
    }
  }

  function editableRow(input, image) {
    return {
      name: input.name, category: input.category, price_cents: input.priceCents,
      stock: input.stock, description: input.description, photo: image.photo, photo_storage_path: image.path,
    };
  }

  return {
    close() { /* No persistent database connection or auth session to close. */ },
    async healthy() {
      checked(await client.from(PRODUCTS).select('id').limit(1));
      checked(await client.from(REVIEWS).select('id').limit(1));
      checked(await client.from('dairydash_settings').select('key').limit(1));
      const storageBucket = checked(await client.storage.getBucket(bucket));
      if (!storageBucket.public) throw new ApiError(503, 'The product image bucket must be public. Follow supabase/README.md.');
      return true;
    },
    getProduct: async (id) => productFromRow(await findRow(id)),
    async listProducts({ search = '', category = '', featured = false } = {}) {
      const rows = await allPages(() => client.rpc('dairydash_list_products', {
        search_text: search, category_filter: category || null, featured_only: featured,
      }).order('catalog_position', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false }).order('id', { ascending: false }));
      return rows.map(productFromRow);
    },
    async createProduct(input) {
      const id = `custom-${randomUUID()}`;
      const image = await uploadPhoto(input.photo, id);
      try {
        return productFromRow(checked(await client.from(PRODUCTS).insert({ id, ...editableRow(input, image) }).select('*').single()));
      } catch (error) {
        await cleanFailedUpload(id, image);
        throw error;
      }
    },
    async updateProduct(id, input) {
      const existing = await findRow(id);
      if (!existing) throw new ApiError(404, 'Product not found.');
      const image = await uploadPhoto(input.photo, id, existing);
      try {
        const updated = checked(await client.from(PRODUCTS).update(editableRow(input, image))
          .eq('id', id).eq('updated_at', existing.updated_at).select('*').maybeSingle());
        if (!updated) throw new ApiError(409, 'This product changed while you were saving. Reload it and try again.');
        if (existing.photo_storage_path && existing.photo_storage_path !== image.path) await removeFiles([existing.photo_storage_path]);
        return productFromRow(updated);
      } catch (error) {
        await cleanFailedUpload(id, image);
        throw error;
      }
    },
    async deleteProduct(id) {
      const existing = await findRow(id);
      if (!existing) return false;
      const deleted = checked(await client.from(PRODUCTS).delete().eq('id', id)
        .eq('updated_at', existing.updated_at).select('id,photo_storage_path'));
      if (!deleted.length) throw new ApiError(409, 'This product changed while you were deleting it. Reload it and try again.');
      if (deleted[0].photo_storage_path) await removeFiles([deleted[0].photo_storage_path]);
      return true;
    },
    async listReviews(id) {
      const rows = await allPages(() => client.from(REVIEWS).select('*').eq('product_id', id)
        .order('created_at', { ascending: false }).order('id', { ascending: false }));
      return rows.map(reviewFromRow);
    },
    async createReview(id, input) {
      return reviewFromRow(checked(await client.from(REVIEWS).insert({ product_id: id, ...input }).select('*').single()));
    },
    async seedCatalog(catalog) {
      const seeded = checked(await client.from('dairydash_settings').select('key').eq('key', 'catalog_seeded').maybeSingle());
      if (seeded) return 0;
      const images = [];
      try {
        const rows = [];
        for (const [position, product] of catalog.entries()) {
          const image = await uploadBytes(product.imageBytes, product.imageType, product.id);
          images.push({ id: product.id, ...image });
          rows.push({
            id: product.id, name: product.name, category: product.category ?? null,
            price_cents: Math.round(Number(product.price.replace(/[^\d.]/g, '')) * 100),
            stock: product.stock ?? null, description: product.description,
            photo: image.photo, photo_storage_path: image.path, catalog_position: position,
          });
        }
        const result = checked(await client.rpc('dairydash_seed_catalog', { catalog: rows }));
        await removeFiles(images.filter((image) => !result.inserted_ids.includes(image.id)).map((image) => image.path));
        return result.inserted_ids.length;
      } catch (error) {
        for (const image of images) await cleanFailedUpload(image.id, image);
        throw error;
      }
    },
  };
}
