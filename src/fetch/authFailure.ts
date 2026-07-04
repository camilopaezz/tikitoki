export class AuthFailureError extends Error {
  constructor(message = 'TikTok authentication failed; cookies may need to be re-exported.') {
    super(message);
    this.name = 'AuthFailureError';
  }
}

const AUTH_FAILURE_PATTERNS = [
  /sign in to confirm you.+?not a bot/i,
  /sign in to confirm your age/i,
  /login required/i,
  /unable to extract login form/i,
  /authentication required/i,
  /confirm you.+?human/i,
];

export function detectAuthFailure(stderr: string): boolean {
  return AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(stderr));
}
