import express from 'express';
import { PRODUCT_CATEGORIES } from '../src/app/data/product-categories.ts';
import { ApiError } from './errors.js';
import { validateProduct, validateReview, validateOrder, validateVersion, validateDeleteVersion, validateOrderUpdate } from './validation.js';

export function createApp(database, {
  allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'],
  logError = console.error,
  authenticate,
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
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match');
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

  async function requireUser(req) {
    const authorization = req.get('Authorization') ?? '';
    const match = /^Bearer ([^\s]{1,8192})$/i.exec(authorization);
    if (!match) throw new ApiError(401, 'Sign in to continue.');
    if (!authenticate) throw new ApiError(503, 'Account verification is not configured for this API.');
    const user = await authenticate(match[1]);
    if (!user?.id) throw new ApiError(401, 'Sign in to continue.');
    return user;
  }

  async function requireAdmin(req, res, next) {
    // The explicit SQLite development provider retains local catalog editing.
    if (authenticate) {
      const user = await requireUser(req);
      if (user.app_metadata?.role !== 'admin') throw new ApiError(403, 'Management requires an admin account.');
    }
    next();
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
  app.post('/api/products', requireAdmin, async (req, res) => {
    const product = await database.createProduct(validateProduct(req.body));
    res.location(`/api/products/${encodeURIComponent(product.id)}`).status(201).json({ data: product });
  });
  app.put('/api/products/:id', requireAdmin, async (req, res) => {
    const existing = await requireProduct(req.params.id);
    const input = validateProduct(req.body, { allowEmptyCategory: !existing.category });
    res.json({ data: await database.updateProduct(req.params.id, input) });
  });
  app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    if (!await database.deleteProduct(req.params.id)) throw new ApiError(404, 'Product not found.');
    res.sendStatus(204);
  });
  app.get('/api/products/:id/reviews', async (req, res) => {
    await requireProduct(req.params.id);
    res.json({ data: await database.listReviews(req.params.id) });
  });
  app.post('/api/products/:id/reviews', async (req, res) => {
    const user = authenticate ? await requireUser(req) : undefined;
    await requireProduct(req.params.id);
    res.status(201).json({ data: await database.createReview(req.params.id, validateReview(req.body), user?.id ?? null) });
  });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.get('/api/products/:id/reviews/:reviewId', async (req, res) => {
    if (!uuid.test(req.params.reviewId)) throw new ApiError(404, 'Review not found.');
    const review = await database.getReview(req.params.id, req.params.reviewId);
    if (!review) throw new ApiError(404, 'Review not found.');
    res.json({ data: review });
  });
  async function changeReview(req, remove) {
    const user = authenticate ? await requireUser(req) : undefined;
    if (!uuid.test(req.params.reviewId)) throw new ApiError(404, 'Review not found.');
    const updatedAt = remove ? validateDeleteVersion(req.get('If-Match')) : validateVersion(req.body?.updatedAt);
    const change = remove ? {} : validateReview(req.body);
    const review = await database.manageReview(req.params.id, req.params.reviewId,
      { id: user?.id ?? null, isAdmin: !authenticate || user?.app_metadata?.role === 'admin' }, updatedAt, change, remove);
    if (!review) throw new ApiError(404, 'Review not found.');
    return review;
  }
  app.put('/api/products/:id/reviews/:reviewId', async (req, res) => res.json({ data: await changeReview(req, false) }));
  app.delete('/api/products/:id/reviews/:reviewId', async (req, res) => {
    await changeReview(req, true);
    res.sendStatus(204);
  });
  app.get('/api/account', async (req, res) => {
    const user = await requireUser(req);
    res.json({ data: { id: user.id, email: user.email, isAdmin: user.app_metadata?.role === 'admin' } });
  });
  app.get('/api/orders', async (req, res) => {
    const user = await requireUser(req);
    res.json({ data: await database.listOrders(user.id) });
  });
  app.get('/api/orders/:id', async (req, res) => {
    const user = await requireUser(req);
    if (!uuid.test(req.params.id)) throw new ApiError(404, 'Order not found.');
    const order = await database.getOrder(req.params.id, user.id);
    if (!order) throw new ApiError(404, 'Order not found.');
    res.json({ data: order });
  });
  app.post('/api/orders', async (req, res) => {
    const user = await requireUser(req);
    const order = await database.createOrder(user.id, validateOrder(req.body));
    res.location(`/api/orders/${order.id}`).status(201).json({ data: order });
  });
  app.get('/api/admin/orders', async (req, res) => {
    const user = await requireUser(req);
    if (user.app_metadata?.role !== 'admin') throw new ApiError(403, 'Order management requires an admin account.');
    res.json({ data: await database.adminListOrders() });
  });
  app.get('/api/admin/orders/:id', async (req, res) => {
    const user = await requireUser(req);
    if (user.app_metadata?.role !== 'admin') throw new ApiError(403, 'Order management requires an admin account.');
    if (!uuid.test(req.params.id)) throw new ApiError(404, 'Order not found.');
    const order = await database.adminGetOrder(req.params.id);
    if (!order) throw new ApiError(404, 'Order not found.');
    res.json({ data: order });
  });
  async function changeOrder(req, admin, remove) {
    const user = await requireUser(req);
    if (admin && user.app_metadata?.role !== 'admin') throw new ApiError(403, 'Order management requires an admin account.');
    if (!uuid.test(req.params.id)) throw new ApiError(404, 'Order not found.');
    const input = remove ? { updatedAt: validateDeleteVersion(req.get('If-Match')), change: {} } : validateOrderUpdate(req.body);
    const order = await database.manageOrder(req.params.id, { id: user.id, isAdmin: admin }, input.updatedAt, input.change, remove);
    if (!order) throw new ApiError(404, 'Order not found.');
    return order;
  }
  for (const admin of [false, true]) {
    const path = admin ? '/api/admin/orders/:id' : '/api/orders/:id';
    app.put(path, async (req, res) => res.json({ data: await changeOrder(req, admin, false) }));
    app.delete(path, async (req, res) => { await changeOrder(req, admin, true); res.sendStatus(204); });
  }
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
        ...(error instanceof ApiError && error.code ? { code: error.code } : {}),
      },
    });
  });
  return app;
}
