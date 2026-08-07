import {
  isGetOrHead, normalizeStaticOptions, safeAssetPath, staticHeaders,
} from '../adapters-common.js';

/** Start a Jinatra app with Bun.serve(). */
export function serve(app, options = {}) {
  if (!app || typeof app.fetch !== 'function') throw new TypeError('serve() expects a Fetch-compatible app');
  if (!globalThis.Bun?.serve) throw new Error('jinatra/bun requires Bun');

  const staticOptions = normalizeStaticOptions(options.static ?? app.staticOptions);
  return Bun.serve({
    hostname: options.hostname ?? '0.0.0.0',
    port: options.port ?? Number(process.env.PORT ?? 3000),
    development: options.development,
    fetch: async (request, bunServer) => {
      const executionCtx = {
        server: bunServer,
        waitUntil(promise) {
          Promise.resolve(promise).catch((error) => console.error('Jinatra background task failed', error));
        },
      };
      if (staticOptions?.first && isGetOrHead(request)) {
        const asset = await serveStatic(request, staticOptions);
        if (asset) return asset;
      }
      const response = await app.fetch(request, options.env ?? process.env, executionCtx);
      if (response.status !== 404 || !staticOptions || !isGetOrHead(request)) return response;
      return (await serveStatic(request, staticOptions)) ?? response;
    },
    error(error) {
      console.error('Jinatra Bun server error', error);
      return new Response('Internal server error', { status: 500 });
    },
  });
}

// `listen` is a Bun adapter convenience; the core remains Fetch-only.
export const listen = serve;

async function serveStatic(request, options) {
  const relative = safeAssetPath(new URL(request.url).pathname, options);
  if (!relative) return options.fallthrough ? null : new Response('Not found', { status: 404 });
  const root = options.directory.replace(/[\\/]$/, '');
  let file = Bun.file(`${root}/${relative}`);
  if (!(await file.exists()) && options.spa) file = Bun.file(`${root}/${options.index}`);
  if (!(await file.exists())) return options.fallthrough ? null : new Response('Not found', { status: 404 });
  const pathname = file.name ?? relative;
  const headers = staticHeaders(pathname, options, file.size, file.lastModified ? new Date(file.lastModified) : null);
  return new Response(request.method === 'HEAD' ? null : file, { headers });
}
