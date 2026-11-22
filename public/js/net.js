// What the app says when a request to its own server fails, kept free of the
// DOM so it can be tested with node:test. Raw messages used to reach the
// screen: iOS's "Load failed", the service worker's "Offline and not cached",
// "The operation was aborted" after a timeout.
export const NO_CONNECTION = 'No connection';
export const OFFLINE_NOT_SAVED = 'No connection, and this hasn’t been saved on this device yet';

// An unreachable server (VPN up, server down) hangs fetch for about a minute
// instead of failing, which froze the screen behind a tap. Past this, give up.
export const REQUEST_TIMEOUT_MS = 10000;

export function friendlyError(err) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return NO_CONNECTION;
  if (err instanceof TypeError) return NO_CONNECTION; // fetch's network failure
  return err?.message || 'Something went wrong';
}
