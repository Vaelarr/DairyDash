import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { createAuthenticator } from '../auth.js';
import { createSupabaseClient } from '../supabase-client.js';
import {
  accountErrorMessage, cleanAuthCallbackPath, emailError, isEmailConfirmationCallback, normalizeEmail, passwordError, safeAccountReturnUrl, validateAccount,
} from '../../src/app/services/account-validation.ts';

const details = {
  name: ' Ana ', email: ' Ana+milk@Example.COM ',
  password: ' a unique passphrase ', confirmPassword: ' a unique passphrase ',
};

test('account validation accepts email aliases, normalizes email and preserves password whitespace', () => {
  assert.equal(normalizeEmail(details.email), 'ana+milk@example.com');
  assert.deepEqual(validateAccount('signup', details), {});
  assert.ok(validateAccount('signup', { ...details, confirmPassword: details.password.trim() }).confirmPassword);
  for (const email of ['ana', 'a@', '@example.com', 'a..b@example.com', '.a@example.com', 'a@example..com',
    'a@-example.com', 'a@example.com\nInjected', `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(64)}.com`]) {
    assert.ok(emailError(email), `Should reject ${email}`);
  }
});

test('new passwords require a passphrase length and reject bcrypt truncation including Unicode', () => {
  assert.ok(passwordError('short'));
  assert.ok(passwordError(' '.repeat(12)));
  assert.ok(passwordError('😀'.repeat(6)));
  assert.equal(passwordError('😀'.repeat(12)), '');
  assert.equal(passwordError('a'.repeat(72)), '');
  assert.ok(passwordError('a'.repeat(73)));
  assert.ok(passwordError('é'.repeat(37)));
  assert.ok(validateAccount('signup', { ...details, name: '   ' }).name);
  assert.ok(validateAccount('signup', { ...details, name: 'a'.repeat(81) }).name);
  assert.ok(validateAccount('signup', { ...details, confirmPassword: '' }).confirmPassword);
});

test('sign-in keeps legacy passwords working and reset does not require name or email', () => {
  assert.deepEqual(validateAccount('signin', { ...details, name: '', password: 'old', confirmPassword: '' }), {});
  assert.ok(validateAccount('signin', { ...details, password: '' }).password);
  assert.deepEqual(validateAccount('reset', { ...details, name: '', email: '' }), {});
  assert.deepEqual(validateAccount('forgot', { ...details, name: '', password: '', confirmPassword: '' }), {});
});

test('account redirects accept local routes and reject external, ambiguous and recursive routes', () => {
  for (const value of [null, 'https://example.com', '//example.com', '/\\example.com', '/orders\n', '/account?returnUrl=/cart']) {
    assert.equal(safeAccountReturnUrl(value), null);
  }
  assert.equal(safeAccountReturnUrl('/cart?checkout=true'), '/cart?checkout=true');
});

test('auth failures give actionable messages without exposing provider diagnostics', () => {
  const diagnostic = 'private schema and provider details';
  for (const code of ['invalid_credentials', 'email_not_confirmed', 'weak_password', 'otp_expired', 'over_email_send_rate_limit', 'unexpected']) {
    assert.ok(!accountErrorMessage({ code, message: diagnostic }).includes(diagnostic));
  }
  assert.match(accountErrorMessage({ code: 'invalid_credentials' }), /email or password/);
  assert.match(accountErrorMessage({ code: 'otp_expired' }), /expired/);
  assert.match(accountErrorMessage({ name: 'AuthImplicitGrantRedirectError', details: { code: 'otp_expired' } }), /expired/);
  assert.match(accountErrorMessage({ status: 429 }), /Wait/);
});

test('callback cleanup removes session tokens and diagnostics while retaining normal routes and recovery intent', () => {
  assert.equal(cleanAuthCallbackPath('/account?action=reset#access_token=secret&refresh_token=secret&type=recovery'), '/account?action=reset');
  assert.equal(cleanAuthCallbackPath('/account#error=access_denied&error_code=otp_expired&error_description=private'), '/account');
  assert.equal(cleanAuthCallbackPath('/account?error=denied&error_code=otp_expired&error_description=private&returnUrl=%2Fcart'), '/account?returnUrl=%2Fcart');
  assert.equal(cleanAuthCallbackPath('/account?code=secret'), '/account');
  assert.equal(cleanAuthCallbackPath('/products?q=Fresh%20Milk#reviews'), '/products?q=Fresh%20Milk#reviews');
});

test('confirmation results require a signup callback and do not replace normal sign-in or recovery', () => {
  assert.equal(isEmailConfirmationCallback('/account#access_token=test&refresh_token=test&type=signup'), true);
  assert.equal(isEmailConfirmationCallback('/account#access_token=test&refresh_token=test&type=email'), true);
  assert.equal(isEmailConfirmationCallback('/account?code=test&type=signup'), true);
  for (const path of ['/account', '/account?confirmed=true', '/account#type=signup',
    '/account#access_token=test&type=signup', '/account?code=test',
    '/account#access_token=test&refresh_token=test&type=magiclink',
    '/account?action=reset#access_token=test&refresh_token=test&type=signup',
    '/account#access_token=test&refresh_token=test&type=recovery',
    '/account#error=access_denied&error_code=otp_expired']) {
    assert.equal(isEmailConfirmationCallback(path), false, path);
  }
});

test('verified account endpoint reads persisted Auth data, stays private, and never returns credentials', async (t) => {
  const persisted = {
    id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com',
    email_confirmed_at: '2026-10-09T00:00:00Z', created_at: '2026-10-09T00:00:00Z',
    user_metadata: { display_name: ' Ana ', role: 'admin', password: 'never-return-this' },
    app_metadata: {}, encrypted_password: 'never-return-this-hash',
  };
  let reads = 0;
  const client = createSupabaseClient({ projectUrl: 'https://accounts-test.supabase.co', secretKey: 'sb_secret_test_only' }, async (input, init) => {
    assert.equal(new URL(input).pathname, '/auth/v1/user');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer valid-session');
    reads++;
    return Response.json(persisted);
  });
  const server = createApp({}, { authenticate: createAuthenticator(client) }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/account`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { Authorization: 'Bearer valid-session' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data, {
    id: persisted.id, email: persisted.email, displayName: 'Ana', emailVerified: true, createdAt: persisted.created_at, isAdmin: false,
  });
  persisted.user_metadata.display_name = 'Updated in database';
  const refreshed = await fetch(url, { headers: { Authorization: 'Bearer valid-session' } });
  assert.equal((await refreshed.json()).data.displayName, 'Updated in database');
  assert.equal(reads, 2);
});

test('unconfirmed accounts and missing email identities cannot use authenticated API actions', async () => {
  for (const user of [{ id: 'unconfirmed', email: 'ana@example.com' }, { id: 'anonymous' }]) {
    const authenticate = createAuthenticator({ auth: { getUser: async () => ({ data: { user }, error: null }) } });
    await assert.rejects(() => authenticate('token'), (error) => error.status === 403 && /Confirm your email/.test(error.message));
  }
});
