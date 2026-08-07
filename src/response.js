import { currentContext } from './request-context.js';
import { isJSX, render } from './jsx/render.js';

export const HTML = Symbol('jinatra.html');

export function html(value, responseStatus, headers = {}) {
  const status = responseStatus ?? currentContext().responseStatus ?? 200;
  if (isJSX(value)) {
    return render(value).then((output) => html(output, status, headers));
  }
  return new Response(String(value ?? ''), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

export function text(value, responseStatus, headers = {}) {
  const context = currentContext();
  return new Response(String(value ?? ''), {
    status: responseStatus ?? context.responseStatus ?? 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...headers },
  });
}

export function json(value, responseStatus, headers = {}) {
  // json() is also the concise request-body parser used by route handlers.
  if (arguments.length === 0) return currentContext().jsonBody();
  const context = currentContext();
  return Response.json(value, {
    status: responseStatus ?? context.responseStatus ?? 200,
    headers,
  });
}

export function redirect(location, responseStatus = 302) {
  const context = currentContext();
  const url = new URL(location, context.url);
  return new Response(null, {
    status: responseStatus,
    headers: { location: url.href },
  });
}

export function raw(value) {
  return { value: String(value ?? ''), [HTML]: true };
}

export class HTTPError extends Error {
  constructor(statusCode, message = `HTTP ${statusCode}`, options = {}) {
    super(message);
    this.name = 'HTTPError';
    this.status = statusCode;
    this.headers = options.headers ?? {};
    this.expose = options.expose ?? statusCode < 500;
  }
}

export const httpError = (statusCode, message, options) =>
  new HTTPError(statusCode, message, options);

export async function normalizeResponse(value, context) {
  if (value && typeof value.then === 'function') {
    return normalizeResponse(await value, context);
  }
  if (value instanceof Response) return value;
  if (value && value[HTML]) return html(value.value);
  if (isJSX(value)) {
    return new Response(await render(value), {
      status: context.responseStatus ?? 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  if (value === undefined || value === null) {
    return new Response(null, { status: context.responseStatus ?? 204 });
  }
  if (typeof value === 'object') {
    return Response.json(value, { status: context.responseStatus ?? 200 });
  }
  return new Response(String(value), {
    status: context.responseStatus ?? 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
