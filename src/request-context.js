// Bun and Node provide AsyncLocalStorage for safe helpers across awaits. Keep
// it optional so a plain Cloudflare Worker can still use context arguments and
// app.fetch without requiring nodejs_compat.
let storage;
let storageReady;
if (typeof process !== 'undefined' && process.versions?.node) {
  const specifier = ['node', 'async_hooks'].join(':');
  storageReady = import(specifier)
    .then(({ AsyncLocalStorage }) => { storage = new AsyncLocalStorage(); })
    .catch(() => {});
}

let fallbackContext;

export async function runWithContext(context, callback) {
  await storageReady;
  if (storage) return storage.run(context, callback);

  // Fetch runtimes without AsyncLocalStorage still work. This fallback is
  // useful for synchronous handlers; async request helpers should use `c` in
  // runtimes that do not provide an async context implementation.
  const previous = fallbackContext;
  fallbackContext = context;
  try {
    return await callback();
  } finally {
    fallbackContext = previous;
  }
}

export function currentContext() {
  const context = storage?.getStore() ?? fallbackContext;
  if (!context) throw new Error('Jinatra request helper used outside a request');
  return context;
}

function accessor(method) {
  const callable = (...args) => currentContext()[method](...args);
  return new Proxy(callable, {
    get(_target, key) {
      if (key === 'name' || key === 'length' || key === 'prototype') return callable[key];
      if (key === Symbol.toStringTag) return 'JinatraRequestHelper';
      return currentContext()[method](String(key));
    },
  });
}

export const params = accessor('param');
export const query = accessor('query');
export const headers = accessor('header');
export const cookies = accessor('cookie');

export function body() { return currentContext().body(); }
export function form() { return currentContext().form(); }
export function request() { return currentContext().req; }

export function status(code) {
  const context = currentContext();
  if (code === undefined) return context.responseStatus;
  if (!Number.isInteger(code) || code < 100 || code > 599) {
    throw new TypeError('status must be an HTTP status code');
  }
  context.responseStatus = code;
  return undefined;
}

export function env() { return currentContext().env; }
export function waitUntil(promise) { return currentContext().waitUntil(promise); }
