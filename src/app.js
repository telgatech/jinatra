/**
 * Jinatra — a tiny Sinatra-style router for Web Standard runtimes.
 *
 * Designed for Cloudflare Workers, Bun, Deno, and other runtimes that use
 * Request, Response, URL, Headers, and fetch-compatible handlers.
 */
export class Jinatra {
  constructor(options = {}) {
    this.routes = [];
    this.sessionOptions = normalizeSessionOptions(options.session);
    this.beforeHandlers = [];
    this.afterHandlers = [];
    this.notFoundHandler = null;
    this.errorHandler = null;
    this.fetch = this.fetch.bind(this);
  }

  before(...handlers) {
    assertHandlers(handlers, 'before');
    this.beforeHandlers.push(...handlers);
    return this;
  }

  after(...handlers) {
    assertHandlers(handlers, 'after');
    this.afterHandlers.push(...handlers);
    return this;
  }

  onError(handler) {
    assertHandler(handler, 'onError');
    this.errorHandler = handler;
    return this;
  }

  session(options) {
    this.sessionOptions = normalizeSessionOptions(options);
    return this;
  }

  notFound(handler) {
    assertHandler(handler, 'notFound');
    this.notFoundHandler = handler;
    return this;
  }

  get(path, ...handlers) { return this.route('GET', path, ...handlers); }
  post(path, ...handlers) { return this.route('POST', path, ...handlers); }
  put(path, ...handlers) { return this.route('PUT', path, ...handlers); }
  patch(path, ...handlers) { return this.route('PATCH', path, ...handlers); }
  delete(path, ...handlers) { return this.route('DELETE', path, ...handlers); }
  options(path, ...handlers) { return this.route('OPTIONS', path, ...handlers); }
  head(path, ...handlers) { return this.route('HEAD', path, ...handlers); }
  all(path, ...handlers) { return this.route('*', path, ...handlers); }

  route(method, path, ...handlers) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new TypeError(`Route path must begin with "/": ${String(path)}`);
    }

    assertHandlers(handlers, `${method} ${path}`);
    const { regex, paramNames } = compilePath(path);

    this.routes.push({
      method: method.toUpperCase(),
      path,
      regex,
      paramNames,
      beforeHandlers: [],
      handlers,
      afterHandlers: [],
    });

    return this;
  }

  /** Add before hooks to the most recently declared route. */
  beforeRoute(...handlers) {
    assertHandlers(handlers, 'beforeRoute');
    const route = this.routes.at(-1);
    if (!route) throw new Error('beforeRoute() requires a preceding route');
    route.beforeHandlers.push(...handlers);
    return this;
  }

  /** Add after hooks to the most recently declared route. */
  afterRoute(...handlers) {
    assertHandlers(handlers, 'afterRoute');
    const route = this.routes.at(-1);
    if (!route) throw new Error('afterRoute() requires a preceding route');
    route.afterHandlers.push(...handlers);
    return this;
  }

  async fetch(request, env = {}, executionCtx = {}) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const routeMatch = this.#findRoute(method, url.pathname);

    if (!routeMatch) {
      const context = new Context({
        request,
        env,
        executionCtx,
        url,
        params: Object.create(null),
        sessionOptions: this.sessionOptions,
      });

      return this.#executeSafely(context, async () => {
        if (this.notFoundHandler) {
          return normalizeResponse(await this.notFoundHandler(context), context);
        }

        return context.json({
          error: 'Route not found',
          method,
          path: url.pathname,
        }, 404);
      });
    }

    const { route, match } = routeMatch;
    const params = extractParams(route, match);

    if (params instanceof Response) return params;

    const context = new Context({
      request,
      env,
      executionCtx,
      url,
      params,
      sessionOptions: this.sessionOptions,
    });

    return this.#executeSafely(context, async () => {
      const beforeResult = await runBeforeHandlers([
        ...this.beforeHandlers,
        ...route.beforeHandlers,
      ], context);

      let response;

      if (beforeResult instanceof Response) {
        response = beforeResult;
      } else {
        const result = await runRouteHandlers(route.handlers, context);
        response = normalizeResponse(result, context);
      }

      return runAfterHandlers([
        ...route.afterHandlers,
        ...this.afterHandlers,
      ], context, response);
    });
  }

  #findRoute(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (match) return { route, match };
    }
    return null;
  }

  async #executeSafely(context, callback) {
    try {
      await context.loadSession();
      return await context.commit(await callback());
    } catch (error) {
      console.error('Jinatra request error', {
        method: context.req.method,
        path: context.url.pathname,
        error,
      });

      if (this.errorHandler) {
        try {
          return await context.commit(normalizeResponse(
            await this.errorHandler(error, context),
            context,
          ));
        } catch (handlerError) {
          console.error('Jinatra error handler failed', handlerError);
        }
      }

      return context.commit(context.json({ error: 'Internal server error' }, 500));
    }
  }
}

// App remains available as a backwards-compatible alias.
export { Jinatra as App };

export class Context {
  constructor({ request, env, executionCtx, url, params, sessionOptions }) {
    this.req = request;
    this.env = env;
    this.executionCtx = executionCtx;
    this.url = url;
    this.params = params;
    this.state = Object.create(null);
    this.session = sessionOptions
      ? new CookieSession(request, sessionOptions)
      : null;
    this.renderView = typeof executionCtx?.renderView === 'function'
      ? executionCtx.renderView
      : null;
  }

  async loadSession() {
    await this.session?.load();
    this.session?.prepareFlash();
  }

  flash(name, value) {
    if (!this.session) {
      throw new Error('Flash messages require cookie sessions');
    }

    if (arguments.length === 0) return this.session.consumeFlash();
    if (arguments.length === 1) return this.session.consumeFlash(name);

    this.session.setFlash(name, value);
    return this;
  }

  async commit(response) {
    return this.session ? this.session.commit(response) : response;
  }

  param(name) {
    return name === undefined ? { ...this.params } : this.params[name];
  }

  query(name) {
    return name === undefined
      ? Object.fromEntries(this.url.searchParams.entries())
      : this.url.searchParams.get(name);
  }

  queries(name) {
    return this.url.searchParams.getAll(name);
  }

  header(name) {
    return this.req.headers.get(name);
  }

  async body() {
    const contentType = this.req.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      return this.req.json();
    }

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      return Object.fromEntries((await this.req.formData()).entries());
    }

    return this.req.text();
  }

  json(data, status = 200, headers = {}) {
    return Response.json(data, { status, headers });
  }

  text(data, status = 200, headers = {}) {
    return new Response(String(data), {
      status,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        ...headers,
      },
    });
  }

  html(data, status = 200, headers = {}) {
    return new Response(String(data), {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        ...headers,
      },
    });
  }

  async render(view, data = {}, options = {}) {
    if (!this.renderView) {
      throw new Error(
        'No view renderer is configured. Pass a renderer through the self-host adapter views option.',
      );
    }

    const html = await this.renderView(view, data, options);
    return this.html(
      html,
      options.status ?? 200,
      options.headers ?? {},
    );
  }

  redirect(location, status = 302) {
    return Response.redirect(new URL(location, this.url), status);
  }

  waitUntil(promise) {
    if (typeof this.executionCtx?.waitUntil !== 'function') {
      throw new Error('waitUntil() is not available in this runtime');
    }
    this.executionCtx.waitUntil(promise);
  }
}

const FLASH_KEY = '__jinatra_flash';

class CookieSession {
  constructor(request, options) {
    this.request = request;
    this.options = options;
    this.data = Object.create(null);
    this.changed = false;
    this.destroyed = false;
  }

  async load() {
    const value = readCookie(this.request.headers.get('cookie'), this.options.name);
    if (!value) return;

    const separator = value.lastIndexOf('.');
    if (separator < 1) return;

    const payload = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (!await verifyValue(payload, signature, this.options.secret)) return;

    try {
      const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.data = Object.assign(Object.create(null), parsed);
      }
    } catch {
      // Invalid session data is treated as an empty session.
    }
  }

  prepareFlash() {
    const stored = this.data[FLASH_KEY];
    if (!Object.hasOwn(this.data, FLASH_KEY)) {
      this.flashCurrent = Object.create(null);
      this.flashNext = Object.create(null);
      return;
    }

    this.flashCurrent = isRecord(stored?.next)
      ? Object.assign(Object.create(null), stored.next)
      : Object.create(null);
    this.flashNext = Object.create(null);
    delete this.data[FLASH_KEY];
    this.changed = true;
  }

  consumeFlash(name) {
    if (name === undefined) {
      const value = { ...this.flashCurrent };
      this.flashCurrent = Object.create(null);
      return value;
    }

    assertSessionKey(name);
    const value = this.flashCurrent[name];
    delete this.flashCurrent[name];
    return value;
  }

  setFlash(name, value) {
    assertSessionKey(name);
    this.flashNext[name] = value;
    this.changed = true;
    this.destroyed = false;
  }

  get(name) {
    return this.data[name];
  }

  set(name, value) {
    assertSessionKey(name);
    this.data[name] = value;
    this.changed = true;
    this.destroyed = false;
    return this;
  }

  delete(name) {
    assertSessionKey(name);
    if (Object.hasOwn(this.data, name)) {
      delete this.data[name];
      this.changed = true;
    }
    return this;
  }

  clear() {
    this.data = Object.create(null);
    this.flashCurrent = Object.create(null);
    this.flashNext = Object.create(null);
    this.changed = true;
    this.destroyed = true;
    return this;
  }

  async commit(response) {
    if (this.flashNext && Object.keys(this.flashNext).length > 0) {
      this.data[FLASH_KEY] = { next: this.flashNext };
      this.changed = true;
    }

    if (!this.changed) return response;

    const headers = new Headers(response.headers);
    const value = this.destroyed
      ? expiredCookie(this.options)
      : await serializeCookie(this.data, this.options);

    headers.append('set-cookie', value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function normalizeSessionOptions(options) {
  if (options == null) return null;
  if (typeof options !== 'object') {
    throw new TypeError('session options must be an object');
  }
  if (typeof options.secret !== 'string' || options.secret.length === 0) {
    throw new TypeError('session secret must be a non-empty string');
  }

  const name = options.name ?? 'jinatra_session';
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new TypeError('session name must be a valid cookie name');
  }

  const sameSite = options.sameSite ?? 'Lax';
  if (!['Strict', 'Lax', 'None'].includes(sameSite)) {
    throw new TypeError('session sameSite must be Strict, Lax, or None');
  }

  const maxAge = options.maxAge;
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
    throw new TypeError('session maxAge must be a non-negative integer');
  }

  const path = options.path ?? '/';
  const domain = options.domain;
  if ([path, domain].some((value) => value !== undefined && /[\r\n;]/.test(value))) {
    throw new TypeError('session cookie attributes must not contain control characters');
  }

  return {
    name,
    secret: options.secret,
    path,
    domain,
    maxAge,
    httpOnly: options.httpOnly ?? true,
    secure: options.secure ?? false,
    sameSite,
  };
}

function readCookie(header, name) {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return null;
}

async function serializeCookie(data, options) {
  const json = JSON.stringify(data);
  const payload = toBase64Url(new TextEncoder().encode(json));
  const signature = await signValue(payload, options.secret);
  const parts = [`${options.name}=${payload}.${signature}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join('; ');
}

function expiredCookie(options) {
  const parts = [
    `${options.name}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

async function signValue(value, secret) {
  const key = await importSecret(secret);
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verifyValue(value, signature, secret) {
  try {
    const key = await importSecret(secret);
    return await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(value),
    );
  } catch {
    return false;
  }
}

async function importSecret(secret) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Cookie sessions require Web Crypto support');
  }

  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSessionKey(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('session key must be a non-empty string');
  }
  if (name === FLASH_KEY) {
    throw new TypeError(`session key ${FLASH_KEY} is reserved`);
  }
}

async function runBeforeHandlers(handlers, context) {
  for (const handler of handlers) {
    const result = await handler(context);
    if (result instanceof Response) return result;
  }
  return undefined;
}

async function runRouteHandlers(handlers, context) {
  for (const handler of handlers) {
    const result = await handler(context);
    if (result !== undefined) return result;
  }
  return undefined;
}

async function runAfterHandlers(handlers, context, initialResponse) {
  let response = initialResponse;

  // Reverse order mirrors stack unwinding.
  for (const handler of [...handlers].reverse()) {
    const result = await handler(context, response);
    if (result instanceof Response) response = result;
  }

  return response;
}

function normalizeResponse(result, context) {
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  if (typeof result === 'object' && result !== null) return context.json(result);
  return context.text(result);
}

function extractParams(route, match) {
  const params = Object.create(null);

  for (let index = 0; index < route.paramNames.length; index += 1) {
    const name = route.paramNames[index];
    const rawValue = match[index + 1];

    try {
      params[name] = decodeURIComponent(rawValue);
    } catch {
      return Response.json(
        { error: `Invalid URL parameter: ${name}` },
        { status: 400 },
      );
    }
  }

  return params;
}

function compilePath(path) {
  const paramNames = [];
  const parts = path.split('/').map((part) => {
    if (part.startsWith(':')) {
      const name = part.slice(1);
      if (!name) throw new Error(`Invalid route parameter in ${path}`);
      paramNames.push(name);
      return '([^/]+)';
    }

    if (part === '*') {
      paramNames.push('wildcard');
      return '(.*)';
    }

    return escapeRegex(part);
  });

  return {
    regex: new RegExp(`^${parts.join('/')}/?$`),
    paramNames,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertHandlers(handlers, label) {
  if (handlers.length === 0) {
    throw new Error(`${label} requires at least one handler`);
  }
  handlers.forEach((handler) => assertHandler(handler, label));
}

function assertHandler(handler, label) {
  if (typeof handler !== 'function') {
    throw new TypeError(`${label} handler must be a function`);
  }
}
