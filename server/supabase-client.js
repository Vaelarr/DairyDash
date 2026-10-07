import { createClient } from '@supabase/supabase-js';

export function supabaseConfig(env = process.env) {
  const projectUrl = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !secretKey) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env, then follow supabase/README.md.');
  }
  let url;
  try { url = new URL(projectUrl); } catch { throw new Error('SUPABASE_URL must be your Supabase project URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('SUPABASE_URL must be an HTTPS project URL without a path or credentials (HTTP is supported for local Supabase).');
  }
  let serviceRole = false;
  try { serviceRole = JSON.parse(Buffer.from(secretKey.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* New keys are not JWTs. */ }
  if (!secretKey.startsWith('sb_secret_') && !serviceRole) {
    throw new Error('Use a server secret key (sb_secret_...) or legacy service_role key, not a publishable/anon key.');
  }
  const bucket = env.SUPABASE_STORAGE_BUCKET?.trim() || 'dairydash-product-images';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket)) throw new Error('SUPABASE_STORAGE_BUCKET must use lowercase letters, numbers and hyphens.');
  return { projectUrl: url.origin, secretKey, bucket };
}

export function createSupabaseClient(config, fetchImplementation = fetch) {
  return createClient(config.projectUrl, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) => fetchImplementation(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)])
          : AbortSignal.timeout(12000),
      }),
    },
  });
}
