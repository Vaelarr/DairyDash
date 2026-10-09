import { createApp } from './app.js';
import { createAuthenticator } from './auth.js';
import { createSupabaseClient, supabaseConfig } from './supabase-client.js';
import { openSupabaseDatabase } from './supabase-database.js';

export function createVercelHandler(env = process.env) {
  let app;
  return (req, res) => {
    if (!app) {
      try {
        const config = supabaseConfig(env);
        const client = createSupabaseClient(config);
        const allowedOrigins = new Set(
          (env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
            .split(',').map((origin) => origin.trim()).filter(Boolean)
        );
        // Capacitor serves bundled Android assets from this HTTPS origin.
        allowedOrigins.add('https://localhost');
        // Vercel supplies these trusted hosts for production and preview deployments.
        for (const host of [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]) {
          if (host) allowedOrigins.add(`https://${host}`);
        }
        // Serverless deployments always use the shared cloud database and verified Auth.
        app = createApp(openSupabaseDatabase(client, { bucket: config.bucket }), {
          allowedOrigins: [...allowedOrigins], authenticate: createAuthenticator(client),
        });
      } catch {
        console.error('Vercel API setup failed. Check the server Supabase environment variables.');
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: {
          message: 'The API is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel and redeploy.',
        } }));
        return;
      }
    }
    return app(req, res);
  };
}
