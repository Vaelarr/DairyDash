import { resolve } from 'node:path';
import { createSupabaseClient, supabaseConfig } from './supabase-client.js';
import { openSupabaseDatabase } from './supabase-database.js';

export async function openRepository(env = process.env) {
  const provider = env.DATABASE_PROVIDER?.trim() || 'supabase';
  if (provider === 'supabase') {
    const config = supabaseConfig(env);
    return { provider, database: openSupabaseDatabase(createSupabaseClient(config), { bucket: config.bucket }) };
  }
  if (provider === 'sqlite') {
    const { openDatabase } = await import('./database.js');
    return { provider, database: openDatabase(resolve(env.DATABASE_PATH ?? 'server/data/dairydash.sqlite')) };
  }
  throw new Error('DATABASE_PROVIDER must be supabase or sqlite.');
}
