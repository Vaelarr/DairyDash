export type AccountMode = 'signin' | 'signup' | 'forgot' | 'reset';
export type AccountField = 'name' | 'email' | 'password' | 'confirmPassword';
export type AccountErrors = Partial<Record<AccountField, string>>;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailError(email: string): string {
  const value = normalizeEmail(email);
  if (!value) return 'Enter your email address.';
  // Match the supported email format consistently in the form and Auth requests.
  const [local = '', domain = '', ...extra] = value.split('@');
  if (value.length > 254 || local.length > 64 || extra.length ||
      !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(domain) ||
      domain.split('.').some((label) => label.length > 63)) {
    return 'Enter a valid email address, such as you@example.com.';
  }
  return '';
}

export function passwordError(password: string): string {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH || !password.trim()) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A unique passphrase works well.`;
  }
  // Supabase uses bcrypt. Do not allow a new password whose tail may be ignored.
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return 'This password is too long. Use fewer characters; accented characters and emoji take more space.';
  }
  return '';
}

export function validateAccount(mode: AccountMode, input: {
  name: string; email: string; password: string; confirmPassword: string;
}): AccountErrors {
  const errors: AccountErrors = {};
  if (mode !== 'reset') {
    const error = emailError(input.email);
    if (error) errors.email = error;
  }
  if (mode === 'signup' && (!input.name.trim() || input.name.trim().length > 80)) {
    errors.name = 'Enter your name using 1 to 80 characters.';
  }
  if (mode === 'signup' || mode === 'reset') {
    const error = passwordError(input.password);
    if (error) errors.password = error;
    if (!input.confirmPassword) errors.confirmPassword = 'Enter your password again.';
    else if (input.confirmPassword !== input.password) errors.confirmPassword = 'The passwords do not match.';
  } else if (mode === 'signin' && !input.password) {
    // Existing accounts can sign in with their original password.
    errors.password = 'Enter your password.';
  }
  return errors;
}

export function safeAccountReturnUrl(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value) ||
      value.split(/[?#]/)[0] === '/account') return null;
  return value;
}

export function isEmailConfirmationCallback(path: string): boolean {
  const url = new URL(path, 'https://dairydash.invalid');
  const hash = new URLSearchParams(url.hash.slice(1));
  const type = hash.get('type') ?? url.searchParams.get('type');
  if (url.searchParams.get('action') === 'reset' || type === 'recovery') return false;
  if (type !== 'signup' && type !== 'email') return false;
  // A type or query flag alone must never turn an existing session into a confirmation.
  return Boolean((hash.get('access_token') && hash.get('refresh_token')) || url.searchParams.get('code'));
}

export function cleanAuthCallbackPath(path: string): string {
  const url = new URL(path, 'https://dairydash.invalid');
  for (const key of ['code', 'error', 'error_code', 'error_description']) {
    if (url.searchParams.has(key)) url.searchParams.delete(key);
  }
  const hash = new URLSearchParams(url.hash.slice(1));
  if (['access_token', 'refresh_token', 'error', 'error_code', 'error_description'].some((key) => hash.has(key))) url.hash = '';
  return `${url.pathname}${url.search}${url.hash}`;
}

export class AccountValidationError extends Error {
  readonly fields: AccountErrors;
  constructor(fields: AccountErrors) {
    super(Object.values(fields)[0] ?? 'Check your account details.');
    this.fields = fields;
  }
}

export function accountErrorMessage(error: unknown): string {
  if (error instanceof AccountValidationError) return error.message;
  const details = error as { code?: string; status?: number; name?: string; details?: { code?: string } } | null;
  switch (details?.code ?? details?.details?.code) {
    case 'invalid_credentials': return 'The email or password is incorrect. Try again.';
    case 'email_not_confirmed': return 'Confirm your email before signing in. You can resend the confirmation below.';
    case 'user_already_exists':
    case 'email_exists': return 'Unable to create this account. Try signing in or resetting your password.';
    case 'weak_password': return 'Choose a stronger password. Avoid common or previously exposed passwords and follow the project password requirements.';
    case 'same_password': return 'Choose a password different from your current password.';
    case 'email_address_invalid': return 'Enter a valid email address.';
    case 'email_address_not_authorized': return 'Email delivery is not configured for this address. Contact support.';
    case 'signup_disabled': return 'Account creation is temporarily unavailable. Try again later.';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found': return 'This email link has expired or was already used. Request a new one.';
    case 'session_not_found':
    case 'refresh_token_not_found': return 'Your session has expired. Sign in again.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Too many requests. Wait a few minutes before trying again.';
  }
  if (details?.status === 429) return 'Too many requests. Wait a few minutes before trying again.';
  if (details?.name === 'AuthRetryableFetchError' || details?.name === 'TypeError') {
    return 'Cannot reach the account service. Check your connection and try again.';
  }
  return 'The account request could not be completed. Please try again.';
}
