import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import {
  isGetOrHead,
  normalizeStaticOptions,
  safeAssetPath,
  staticHeaders,
} from '../adapters-common.js';

/** Run a Jinatra app using Node's built-in HTTP server. */
export function serve(app, options = {}) {
  if (!app || typeof app.fetch !== 'function') {
    throw new TypeError('serve() expects a Fetch-compatible app');
  }

  const staticOptions = normalizeStaticOptions(options.static);
  const hostname = options.hostname ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);

  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = toWebRequest(incoming, options.origin);
      const env = options.env ?? process.env;
      const executionCtx = createExecutionContext(options.views);

      let response = null;
      if (staticOptions?.first && isGetOrHead(request)) {
        response = await serveStatic(request, staticOptions);
      }

      response ??= await app.fetch(request, env, executionCtx);

      if (
        response.status === 404 &&
        staticOptions &&
        !staticOptions.first &&
        isGetOrHead(request)
      ) {
        response = (await serveStatic(request, staticOptions)) ?? response;
      }

      await writeWebResponse(outgoing, response, incoming.method === 'HEAD');
      executionCtx.flush();
    } catch (error) {
      console.error('Jinatra Node server error', error);
      if (!outgoing.headersSent) {
        outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      outgoing.end('Internal server error');
    }
  });

  server.listen(port, hostname);
  return server;
}

function toWebRequest(incoming, origin) {
  const host = incoming.headers.host ?? 'localhost';
  const base = origin ?? `http://${host}`;
  const url = new URL(incoming.url ?? '/', base);
  const method = incoming.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : Readable.toWeb(incoming);

  return new Request(url, {
    method,
    headers: incoming.headers,
    body,
    duplex: body ? 'half' : undefined,
  });
}

async function writeWebResponse(outgoing, response, headOnly) {
  outgoing.statusCode = response.status;
  outgoing.statusMessage = response.statusText;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);

  if (headOnly || !response.body) {
    outgoing.end();
    return;
  }

  await new Promise((resolvePromise, reject) => {
    const stream = Readable.fromWeb(response.body);
    stream.on('error', reject);
    outgoing.on('error', reject);
    outgoing.on('finish', resolvePromise);
    stream.pipe(outgoing);
  });
}

function createExecutionContext(views) {
  const tasks = [];
  return {
    renderView: normalizeRenderer(views),
    waitUntil(promise) {
      tasks.push(Promise.resolve(promise));
    },
    flush() {
      Promise.allSettled(tasks).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            console.error('Jinatra background task failed', result.reason);
          }
        }
      });
    },
  };
}

async function serveStatic(request, options) {
  const url = new URL(request.url);
  const relative = safeAssetPath(url.pathname, options);
  if (!relative) return options.fallthrough ? null : new Response('Not found', { status: 404 });

  const root = resolve(options.directory);
  let pathname = resolve(root, relative);
  if (pathname !== root && !pathname.startsWith(`${root}${sep}`)) {
    return new Response('Forbidden', { status: 403 });
  }

  let info = await fileStat(pathname);
  if (!info && options.spa) {
    pathname = resolve(root, options.index);
    info = await fileStat(pathname);
  }

  if (!info) return options.fallthrough ? null : new Response('Not found', { status: 404 });

  const headers = staticHeaders(pathname, options, info.size, info.mtime);
  if (request.method === 'HEAD') return new Response(null, { headers });

  return new Response(Readable.toWeb(createReadStream(pathname)), { headers });
}

async function fileStat(pathname) {
  try {
    const info = await stat(pathname);
    return info.isFile() ? info : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

function normalizeRenderer(views) {
  if (!views) return null;
  if (typeof views === 'function') return views;
  if (typeof views.render === 'function') return views.render.bind(views);
  throw new TypeError('views must be a renderer function or an object with render()');
}
