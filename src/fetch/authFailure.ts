export type AuthFailurePlatform = 'tiktok' | 'instagram';

export class AuthFailureError extends Error {
  readonly platform?: AuthFailurePlatform;
  constructor(
    message = 'Authentication failed; cookies may need to be re-exported.',
    platform?: AuthFailurePlatform,
  ) {
    super(message);
    this.name = 'AuthFailureError';
    this.platform = platform;
  }
}

const AUTH_FAILURE_PATTERNS = [
  /sign in to confirm you.+?not a bot/i,
  /sign in to confirm your age/i,
  /login required/i,
  /unable to extract login form/i,
  /authentication required/i,
  /confirm you.+?human/i,
  /empty media response/i,
  /accessible in your browser without being logged-in/i,
];

export function detectAuthFailure(stderr: string): boolean {
  return AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(stderr));
}
