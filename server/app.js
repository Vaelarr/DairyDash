import express from 'express';
import { PRODUCT_CATEGORIES } from '../src/app/data/product-categories.ts';
import { ApiError } from './errors.js';
import { validateProduct, validateReview } from './validation.js';

export function createApp(database, {
  allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'],
  logError = console.error,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin && !allowedOrigins.includes(origin)) {
      return next(new ApiError(403, 'This application origin is not allowed.'));
    }
    if (origin) res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (['POST', 'PUT'].includes(req.method) && !req.is('application/json')) {
      return next(new ApiError(415, 'Use Content-Type: application/json.'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '7mb' }));

  async function requireProduct(id) {
    const product = await database.getProduct(id);
    if (!product) throw new ApiError(404, 'Product not found.');
    return product;
  }

  app.get('/api/health', async (req, res) => {
    const healthy = await database.healthy();
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable' });
  });
  app.get('/api/categories', (req, res) => res.json({ data: PRODUCT_CATEGORIES }));
  app.get('/api/products', async (req, res) => {
    const { q = '', category = '', featured = 'false' } = req.query;
    if (typeof q !== 'string' || q.length > 100 || typeof category !== 'string' ||
        (category && !PRODUCT_CATEGORIES.includes(category)) || !['true', 'false'].includes(featured)) {
      throw new ApiError(400, 'Use a search up to 100 characters, a supported category, and featured=true or false.');
    }
    res.json({ data: await database.listProducts({ search: q.trim(), category, featured: featured === 'true' }) });
  });
  app.get('/api/products/:id', async (req, res) => res.json({ data: await requireProduct(req.params.id) }));
  app.post('/api/products', async (req, res) => {
    const product = await database.createProduct(validateProduct(req.body));
    res.location(`/api/products/${encodeURIComponent(product.id)}`).status(201).json({ data: product });
  });
  app.put('/api/products/:id', async (req, res) => {
    const existing = await requireProduct(req.params.id);
    const input = validateProduct(req.body, { allowEmptyCategory: !existing.category });
    res.json({ data: await database.updateProduct(req.params.id, input) });
  });
  app.delete('/api/products/:id', async (req, res) => {
    if (!await database.deleteProduct(req.params.id)) throw new ApiError(404, 'Product not found.');
    res.sendStatus(204);
  });
  app.get('/api/products/:id/reviews', async (req, res) => {
    await requireProduct(req.params.id);
    res.json({ data: await database.listReviews(req.params.id) });
  });
  app.post('/api/products/:id/reviews', async (req, res) => {
    await requireProduct(req.params.id);
    res.status(201).json({ data: await database.createReview(req.params.id, validateReview(req.body)) });
  });
  app.use((req, res, next) => next(new ApiError(404, 'API route not found.')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') error = new ApiError(413, 'The request is too large. Use an image up to 5 MB.');
    else if (error.type === 'entity.parse.failed') error = new ApiError(400, 'The request contains invalid JSON.');
    const status = error instanceof ApiError ? error.status : 500;
    if (status === 500) logError(error);
    res.status(status).json({
      error: {
        message: status === 500 ? 'The server could not complete the request.' : error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
  });
  return app;
}
