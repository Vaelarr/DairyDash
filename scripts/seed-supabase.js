import { readFile } from 'node:fs/promises';
import { SEED_PRODUCTS } from '../src/app/data/seed-products.ts';
import { createSupabaseClient, supabaseConfig } from '../server/supabase-client.js';
import { openSupabaseDatabase } from '../server/supabase-database.js';

try {
  const config = supabaseConfig();
  const database = openSupabaseDatabase(createSupabaseClient(config), { bucket: config.bucket });
  await database.healthy();
  const catalog = await Promise.all(SEED_PRODUCTS.map(async (product) => ({
    ...product,
    imageBytes: await readFile(new URL(`../src/${product.photo}`, import.meta.url)),
    imageType: 'image/webp',
  })));
  const count = await database.seedCatalog(catalog);
  console.log(count ? `Seeded ${count} products and uploaded their images to Supabase Storage.` : 'Catalog already initialized; no existing products or images were changed.');
} catch (error) {
  console.error(`Supabase setup failed: ${error.message}`);
  process.exitCode = 1;
}
