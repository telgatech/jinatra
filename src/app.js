import { runWithContext } from './request-context.js';
import { html, json, text, redirect, normalizeResponse, HTTPError } from './response.js';
import { normalizeStaticOptions } from './adapters-common.js';

/** A small Fetch-native router with concise method names. */
export class Jinatra {
  constructor(options = {}) {
    this.routes = [];
    this.middleware = [];
    this.beforeHandlers = [];
    this.afterHandlers = [];
    this.notFoundHandler = null;
    this.errorHandler = null;
    this.staticOptions = null;
    this.cronHandlers = new Map();
    this.sessionOptions = normalizeSessionOptions(options.session);
    this.fetch = this.fetch.bind(this);
  }

  use(...handlers) {
    assertHandlers(handlers, 'use');
    this.middleware.push(...handlers);
    return this;
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

  notFound(handler) {
    assertHandler(handler, 'notFound');
    this.notFoundHandler = handler;
    return this;
  }

  session(options) {
    this.sessionOptions = normalizeSessionOptions(options);
    return this;
  }

  /** Register a handler for a Cloudflare Cron Trigger expression. */
  cron(expression, ...handlers) {
    if (typeof expression !== 'string' || !expression.trim()) {
      throw new TypeError('cron expression must be a non-empty string');
    }
    assertHandlers(handlers, `cron ${expression}`);
    const key = expression.trim();
    this.cronHandlers.set(key, [...(this.cronHandlers.get(key) ?? []), ...handlers]);
    return this;
  }

  /** Build the object Cloudflare Workers expects as its module export. */
  worker() {
    const worker = { fetch: this.fetch };
    if (this.cronHandlers.size > 0) {
      worker.scheduled = async (controller, env, ctx) => {
        const expression = typeof controller?.cron === 'string'
          ? controller.cron.trim()
          : controller?.cron;
        const handlers = expression === undefined && this.cronHandlers.size === 1
          ? this.cronHandlers.values().next().value
          : this.cronHandlers.get(expression);
        if (!handlers) return undefined;
        for (const handler of handlers) await handler(controller, env, ctx);
      };
    }
    return worker;
  }

  static(directory, options = {}) {
    this.staticOptions = normalizeStaticOptions(
      typeof directory === 'string' ? { ...options, directory } : directory,
    );
    return this;
  }

  get(path, ...handlers) { return this.route('GET', path, ...handlers); }
  post(path, ...handlers) { return this.route('POST', path, ...handlers); }
  put(path, ...handlers) { return this.route('PUT', path, ...handlers); }
  patch(path, ...handlers) { return this.route('PATCH', path, ...handlers); }
  delete(path, ...handlers) { return this.route('DELETE', path, ...handlers); }
  options(path, ...handlers) { return this.route('OPTIONS', path, ...handlers); }
  head(path, ...handlers) { return this.route('HEAD', path, ...handlers); }
  any(path, ...handlers) { return this.route('*', path, ...handlers); }
  all(path, ...handlers) { return this.any(path, ...handlers); }

  route(method, path, ...handlers) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new TypeError(`Route path must begin with "/": ${String(path)}`);
    }
    assertHandlers(handlers, `${method} ${path}`);
    const { regex, paramNames } = compilePath(path);
    this.routes.push({
      method: method.toUpperCase(), path, regex, paramNames,
      beforeHandlers: [], afterHandlers: [], handlers,
    });
    return this;
  }

  beforeRoute(...handlers) {
    assertHandlers(handlers, 'beforeRoute');
    const route = this.routes.at(-1);
    if (!route) throw new Error('beforeRoute() requires a preceding route');
    route.beforeHandlers.push(...handlers);
    return this;
  }

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
    const found = this.#findRoute(method, url.pathname);
    const params = found ? extractParams(found.route, found.match) : Object.create(null);
    if (params instanceof Response) return params;

    const context = new Context({
      request, env, executionCtx, url, params, sessionOptions: this.sessionOptions,
    });

    return runWithContext(context, () => this.#executeSafely(context, async () => {
      await context.loadSession();
      const before = await runHandlers(
        [...this.beforeHandlers, ...(found?.route.beforeHandlers ?? [])], context,
      );
      let response;
      if (before instanceof Response) {
        response = before;
      } else if (!found) {
        const result = await compose([
          ...this.middleware,
          async () => this.notFoundHandler
            ? this.notFoundHandler(context)
            : json({ error: 'Route not found', method, path: url.pathname }, 404),
        ], context);
        response = await normalizeResponse(result, context);
      } else {
        const result = await compose(
          [...this.middleware, ...found.route.handlers], context,
        );
        response = await normalizeResponse(result, context);
      }

      return runAfterHandlers([
        ...(found?.route.afterHandlers ?? []), ...this.afterHandlers,
      ], context, response);
    }));
  }

  async #executeSafely(context, callback) {
    try {
      return await context.commit(await callback());
    } catch (error) {
      if (this.errorHandler) {
        try {
          return await context.commit(await normalizeResponse(
            await this.errorHandler(error, context), context,
          ));
        } catch (handlerError) {
          console.error('Jinatra error handler failed', handlerError);
        }
      }
      if (error instanceof HTTPError) {
        return context.commit(new Response(error.expose ? error.message : 'Internal server error', {
          status: error.status,
          headers: { 'content-type': 'text/plain; charset=utf-8', ...error.headers },
        }));
      }
      console.error('Jinatra request error', error);
      return context.commit(json({ error: 'Internal server error' }, 500));
    }
  }

  #findRoute(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (match) return { route, match };
    }
    // HEAD conventionally uses the GET representation when no HEAD route exists.
    if (method === 'HEAD') return this.#findRoute('GET', pathname);
    return null;
  }

}

export { Jinatra as App };

export class Context {
  constructor({ request, env, executionCtx, url, params, sessionOptions }) {
    this.req = request;
    this.env = env;
    this.executionCtx = executionCtx;
    this.url = url;
    this.params = params;
    this.state = Object.create(null);
    this.responseStatus = undefined;
    this.session = sessionOptions ? new CookieSession(request, sessionOptions) : null;
    this.renderView = typeof executionCtx?.renderView === 'function' ? executionCtx.renderView : null;
  }

  param(name) {
    return name === undefined ? { ...this.params } : this.params[name];
  }

  query(name) {
    if (name === undefined) return Object.fromEntries(this.url.searchParams.entries());
    return this.url.searchParams.get(name);
  }

  queries(name) { return this.url.searchParams.getAll(name); }
  header(name) {
    return name === undefined
      ? Object.fromEntries(this.req.headers.entries())
      : this.req.headers.get(name);
  }

  cookie(name) {
    const values = parseCookies(this.req.headers.get('cookie'));
    return name === undefined ? values : values[name];
  }

  async body() {
    const type = this.req.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return this.req.json();
    if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
      return this.form();
    }
    return this.req.text();
  }

  async jsonBody() { return this.req.json(); }

  async form() {
    return Object.fromEntries((await this.req.formData()).entries());
  }

  json(data, code, headers) { return json(data, code, headers); }
  html(data, code, headers) { return html(data, code, headers); }
  text(data, code, headers) { return text(data, code, headers); }
  redirect(location, code) { return redirect(location, code); }
  status(code) {
    if (code === undefined) return this.responseStatus ?? 200;
    this.responseStatus = code;
    return this;
  }

  async render(view, data = {}, options = {}) {
    if (!this.renderView) throw new Error('No view renderer is configured');
    return this.html(await this.renderView(view, data, options), options.status, options.headers);
  }

  async loadSession() {
    await this.session?.load();
    this.session?.prepareFlash();
  }

  async commit(response) { return this.session ? this.session.commit(response) : response; }

  flash(name, value) {
    if (!this.session) throw new Error('Flash messages require cookie sessions');
    if (arguments.length === 0) return this.session.consumeFlash();
    if (arguments.length === 1) return this.session.consumeFlash(name);
    this.session.setFlash(name, value);
    return this;
  }

  waitUntil(promise) {
    if (typeof this.executionCtx?.waitUntil !== 'function') throw new Error('waitUntil() is not available');
    this.executionCtx.waitUntil(promise);
  }
}

async function compose(handlers, context, index = 0) {
  if (index >= handlers.length) return undefined;
  let nextCalled = false;
  let downstream;
  const next = async () => {
    nextCalled = true;
    downstream = await compose(handlers, context, index + 1);
    return downstream;
  };
  const result = await handlers[index](context, next);
  return nextCalled && result === undefined ? downstream : result;
}

async function runHandlers(handlers, context) {
  for (const handler of handlers) {
    const result = await handler(context);
    if (result instanceof Response) return result;
  }
}

async function runAfterHandlers(handlers, context, response) {
  for (const handler of [...handlers].reverse()) {
    const result = await handler(context, response);
    if (result instanceof Response) response = result;
  }
  return response;
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
  return { regex: new RegExp(`^${parts.join('/')}/?$`), paramNames };
}

function extractParams(route, match) {
  const params = Object.create(null);
  for (let i = 0; i < route.paramNames.length; i += 1) {
    try { params[route.paramNames[i]] = decodeURIComponent(match[i + 1]); }
    catch {
      return Response.json({ error: `Invalid URL parameter: ${route.paramNames[i]}` }, { status: 400 });
    }
  }
  return params;
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function assertHandler(handler, label) {
  if (typeof handler !== 'function') throw new TypeError(`${label} handler must be a function`);
}
function assertHandlers(handlers, label) {
  if (!handlers.length) throw new Error(`${label} requires at least one handler`);
  handlers.forEach((handler) => assertHandler(handler, label));
}
function parseCookies(header) {
  const result = Object.create(null);
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const value = part.slice(index + 1).trim();
    try { result[part.slice(0, index).trim()] = decodeURIComponent(value); }
    catch { result[part.slice(0, index).trim()] = value; }
  }
  return result;
}

// Signed cookie sessions remain a small optional compatibility feature.
const FLASH_KEY = '__jinatra_flash';
class CookieSession {
  constructor(request, options) { this.request = request; this.options = options; this.data = Object.create(null); this.changed = false; this.destroyed = false; }
  async load() {
    const value = parseCookies(this.request.headers.get('cookie'))[this.options.name];
    if (!value) return;
    const separator = value.lastIndexOf('.'); if (separator < 1) return;
    const payload = value.slice(0, separator); const signature = value.slice(separator + 1);
    if (!await verifyValue(payload, signature, this.options.secret)) return;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.data = Object.assign(Object.create(null), parsed);
    } catch { /* invalid cookie = empty session */ }
  }
  prepareFlash() {
    const stored = this.data[FLASH_KEY];
    this.flashCurrent = stored?.next && typeof stored.next === 'object' ? { ...stored.next } : {};
    this.flashNext = {}; if (stored) { delete this.data[FLASH_KEY]; this.changed = true; }
  }
  consumeFlash(name) { if (name === undefined) { const value = { ...this.flashCurrent }; this.flashCurrent = {}; return value; } const value = this.flashCurrent[name]; delete this.flashCurrent[name]; return value; }
  setFlash(name, value) { this.flashNext[name] = value; this.changed = true; }
  get(name) { return this.data[name]; }
  set(name, value) { this.data[name] = value; this.changed = true; return this; }
  delete(name) { delete this.data[name]; this.changed = true; return this; }
  clear() { this.data = {}; this.flashCurrent = {}; this.flashNext = {}; this.changed = true; this.destroyed = true; return this; }
  async commit(response) {
    if (Object.keys(this.flashNext ?? {}).length) { this.data[FLASH_KEY] = { next: this.flashNext }; this.changed = true; }
    if (!this.changed) return response;
    const headers = new Headers(response.headers);
    headers.append('set-cookie', this.destroyed ? expiredCookie(this.options) : await serializeCookie(this.data, this.options));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
function normalizeSessionOptions(options) {
  if (options == null) return null;
  if (typeof options.secret !== 'string' || !options.secret) throw new TypeError('session secret must be a non-empty string');
  return { name: options.name ?? 'jinatra_session', secret: options.secret, path: options.path ?? '/', domain: options.domain, maxAge: options.maxAge, httpOnly: options.httpOnly ?? true, secure: options.secure ?? false, sameSite: options.sameSite ?? 'Lax' };
}
async function importSecret(secret) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function signValue(value, secret) { return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await importSecret(secret), new TextEncoder().encode(value)))); }
async function verifyValue(value, signature, secret) { try { return await crypto.subtle.verify('HMAC', await importSecret(secret), fromBase64Url(signature), new TextEncoder().encode(value)); } catch { return false; } }
function toBase64Url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function fromBase64Url(value) { const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=')); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function serializeCookie(data, options) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
  const parts = [`${options.name}=${payload}.${await signValue(payload, options.secret)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`); if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly'); if (options.secure) parts.push('Secure'); if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}
function expiredCookie(options) { return `${options.name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=${options.path}; HttpOnly; SameSite=${options.sameSite}`; }
