import {
  isGetOrHead,
  normalizeStaticOptions,
  safeAssetPath,
  staticHeaders,
} from '../adapters-common.js';

/**
 * Run a Jinatra app using Bun.serve(). Static files are optional and are
 * served before the application routes.
 */
export function serve(app, options = {}) {
  if (!app || typeof app.fetch !== 'function') {
    throw new TypeError('serve() expects a Fetch-compatible app');
  }

  const staticOptions = normalizeStaticOptions(options.static);
  const hostname = options.hostname ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);

  return Bun.serve({
    hostname,
    port,
    development: options.development,
    fetch: async (request, server) => {
      const env = options.env ?? process.env;
      const executionCtx = {
        server,
        renderView: normalizeRenderer(options.views),
        waitUntil(promise) {
          Promise.resolve(promise).catch((error) => {
            console.error('Jinatra background task failed', error);
          });
        },
      };

      if (staticOptions?.first && isGetOrHead(request)) {
        const response = await serveStatic(request, staticOptions);
        if (response) return response;
      }

      const response = await app.fetch(request, env, executionCtx);
      if (response.status !== 404 || !staticOptions || !isGetOrHead(request)) {
        return response;
      }

      return (await serveStatic(request, staticOptions)) ?? response;
    },
    error(error) {
      console.error('Jinatra Bun server error', error);
      return new Response('Internal server error', { status: 500 });
    },
  });
}

async function serveStatic(request, options) {
  const url = new URL(request.url);
  const relative = safeAssetPath(url.pathname, options);
  if (!relative) return options.fallthrough ? null : new Response('Not found', { status: 404 });

  const root = options.directory.replace(/[\\/]$/, '');
  let pathname = `${root}/${relative}`;
  let file = Bun.file(pathname);

  if (!(await file.exists()) && options.spa) {
    pathname = `${root}/${options.index}`;
    file = Bun.file(pathname);
  }

  if (!(await file.exists())) {
    return options.fallthrough ? null : new Response('Not found', { status: 404 });
  }

  const headers = staticHeaders(pathname, options, file.size, file.lastModified ? new Date(file.lastModified) : null);
  return new Response(request.method === 'HEAD' ? null : file, { headers });
}

function normalizeRenderer(views) {
  if (!views) return null;
  if (typeof views === 'function') return views;
  if (typeof views.render === 'function') return views.render.bind(views);
  throw new TypeError('views must be a renderer function or an object with render()');
}
