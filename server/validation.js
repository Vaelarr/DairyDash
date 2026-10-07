import { PRODUCT_CATEGORIES } from '../src/app/data/product-categories.ts';
import { ApiError } from './errors.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PRICE = 999999.99;

function objectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Send a JSON object.');
  }
}

function text(value, field, maximum, required, fields) {
  if (typeof value !== 'string') {
    fields[field] = `Enter ${field}.`;
    return '';
  }
  const result = value.trim();
  if ((required && !result) || result.length > maximum) {
    fields[field] = `Enter ${field}${required ? ' (required)' : ''}, up to ${maximum} characters.`;
  }
  return result;
}

function photoValue(photo, fields) {
  if (photo === undefined || photo === null || photo === '') return null;
  if (typeof photo !== 'string') {
    fields.photo = 'Choose a product image.';
    return null;
  }
  // Existing catalog assets remain relative to the web/native application's bundle.
  if (/^assets\/Products\/[^/\\\x00-\x1f]+\.(webp|png|jpe?g)$/i.test(photo) && !photo.includes('..')) {
    return photo;
  }
  if (photo.length <= 2048) {
    try {
      const url = new URL(photo);
      if (url.protocol === 'https:' && !url.username && !url.password) return photo;
    } catch { /* Try an inline image below. */ }
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match || match[2].length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) {
    fields.photo = 'Use a PNG, JPG, or WebP image up to 5 MB, or an HTTPS image URL.';
    return null;
  }
  const bytes = Buffer.from(match[2], 'base64');
  const valid = match[1] === 'jpeg'
    ? bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!valid || bytes.length > MAX_PHOTO_BYTES || bytes.toString('base64') !== match[2]) {
    fields.photo = 'Choose a valid PNG, JPG, or WebP image up to 5 MB.';
    return null;
  }
  return photo;
}

export function validateProduct(body, { allowEmptyCategory = false } = {}) {
  objectBody(body);
  const fields = {};
  const name = text(body.name, 'name', 60, true, fields);
  const description = text(body.description ?? '', 'description', 200, false, fields);
  const category = text(body.category, 'category', 40, !allowEmptyCategory, fields);
  if (category && !PRODUCT_CATEGORIES.includes(category)) fields.category = 'Select a supported category.';
  const price = body.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0.01 || price > MAX_PRICE ||
      Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {
    fields.price = 'Enter a price from 0.01 to 999,999.99 with at most two decimal places.';
  }
  const stock = body.stock ?? null;
  if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000000)) {
    fields.stock = 'Enter a whole stock count from 0 to 1,000,000,000.';
  }
  const photo = photoValue(body.photo, fields);
  if (Object.keys(fields).length) {
    throw new ApiError(400, Object.values(fields)[0], fields);
  }
  return { name, description, category: category || null, priceCents: Math.round(price * 100), stock, photo };
}

export function validateReview(body) {
  objectBody(body);
  const fields = {};
  const name = text(body.name, 'name', 60, true, fields);
  const comment = text(body.comment, 'comment', 500, true, fields);
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    fields.rating = 'Choose a whole rating from 1 to 5 stars.';
  }
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], fields);
  return { name, comment, rating: body.rating };
}
