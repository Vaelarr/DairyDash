import { ApiError } from './errors.js';

/** Verify tokens with Supabase Auth; never trust client metadata or a decoded JWT alone. */
export function createAuthenticator(client) {
  return async (token) => {
    let result;
    try {
      result = await client.auth.getUser(token);
    } catch {
      throw new ApiError(503, 'Account verification is unavailable. Try again.');
    }
    if (result.error) {
      if (!result.error.status || result.error.status >= 500) {
        throw new ApiError(503, 'Account verification is unavailable. Try again.');
      }
      throw new ApiError(401, 'Your session has expired. Sign in again.');
    }
    if (!result.data.user) throw new ApiError(401, 'Sign in to continue.');
    if (!result.data.user.email || !result.data.user.email_confirmed_at) {
      throw new ApiError(403, 'Confirm your email before using your account.');
    }
    return result.data.user;
  };
}
