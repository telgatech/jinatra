/**
 * Optional Cloudflare adapter that falls back to a Workers Static Assets
 * binding after Jinatra returns 404. The Jinatra core remains platform-neutral.
 */
export function withAssets(app, options = {}) {
  if (!app || typeof app.fetch !== 'function') {
    throw new TypeError('withAssets() expects a Fetch-compatible app');
  }

  const binding = options.binding ?? 'ASSETS';
  const methods = new Set(options.methods ?? ['GET', 'HEAD']);
  const worker = typeof app.worker === 'function' ? app.worker() : app;
  const result = {
    async fetch(request, env = {}, ctx = {}) {
      const response = await app.fetch(request, env, ctx);
      if (response.status !== 404 || !methods.has(request.method)) return response;

      const assets = env[binding];
      if (!assets || typeof assets.fetch !== 'function') return response;
      return assets.fetch(request);
    },
  };
  if (typeof worker.scheduled === 'function') result.scheduled = worker.scheduled;
  return result;
}
