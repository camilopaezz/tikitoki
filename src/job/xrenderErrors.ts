/** Raised when `/xrender` is requested before the chrome pipeline is wired. */
export class XRenderNotReadyError extends Error {
  constructor() {
    super('Feed-card render (/xrender) is not available yet.');
    this.name = 'XRenderNotReadyError';
  }
}
