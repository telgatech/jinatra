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
const requestFacadeSymbol = Symbol('jinatra.requestFacade');

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

/** Build a Sinatra-inspired request facade for the current context. */
export function createRequestFacade(context) {
  const facade = new RequestFacade(context);
  return new Proxy(facade, {
    get(target, key, receiver) {
      if (key === 'then') return undefined;
      if (Reflect.has(target, key)) {
        const value = Reflect.get(target, key, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      if (typeof key === 'string') return context.param(key);
      return undefined;
    },
  });
}

export function installRequestHelpers(context) {
  const facade = createRequestFacade(context);
  context[requestFacadeSymbol] = facade;
  for (const key of [
    'accept', 'accepts', 'preferredType', 'scheme', 'scriptName', 'pathInfo', 'port',
    'requestMethod', 'method', 'queryString', 'contentLength', 'mediaType', 'host',
    'hostWithPort', 'referrer', 'referer', 'userAgent', 'cookies', 'headers', 'xhr',
    'path', 'ip', 'secure', 'forwarded', 'formData', 'rawFormData', 'get', 'post',
    'put', 'patch', 'delete', 'options', 'head',
  ]) {
    Object.defineProperty(context, key, {
      configurable: true,
      get: () => facade[key],
    });
  }
  return facade;
}

function currentRequestFacade() {
  return currentContext()[requestFacadeSymbol];
}

class RequestFacade {
  constructor(context) {
    this.context = context;
    this.req = context.req;
  }

  get accept() { return parseAccept(this.req.headers.get('accept')); }
  accepts(type) { return this.accept.some((accepted) => mediaTypeMatches(accepted, type)); }
  preferredType(types) {
    const choices = Array.isArray(types) ? types : [types];
    for (const accepted of this.accept) {
      const choice = choices.find((type) => mediaTypeMatches(accepted, type));
      if (choice) return choice;
    }
    return null;
  }

  get body() { return this.context.body(); }
  json() { return this.context.jsonBody(); }
  form() { return this.context.form(); }
  rawFormData() { return this.req.formData(); }

  get scheme() { return this.urlObject.protocol.replace(':', ''); }
  get scriptName() { return this.context.scriptName ?? ''; }
  get pathInfo() { return this.urlObject.pathname; }
  get port() { return Number(this.urlObject.port || (this.secure ? 443 : 80)); }
  get requestMethod() { return this.req.method; }
  get method() { return this.requestMethod; }
  get queryString() { return this.urlObject.search.slice(1); }
  get contentLength() {
    const value = this.req.headers.get('content-length');
    return value == null ? null : Number(value);
  }
  get mediaType() { return mediaType(this.req.headers.get('content-type')); }
  get host() { return this.urlObject.hostname; }
  get hostWithPort() { return this.urlObject.host; }
  get referrer() { return this.req.headers.get('referer') ?? '/'; }
  get referer() { return this.referrer; }
  get userAgent() { return this.req.headers.get('user-agent'); }
  get cookies() { return this.context.cookie(); }
  get params() { return this.context.param(); }
  get headers() { return this.context.header(); }
  get query() { return this.context.query(); }
  get xhr() { return this.req.headers.get('x-requested-with')?.toLowerCase() === 'xmlhttprequest'; }
  get url() { return this.req.url; }
  get path() { return this.pathInfo; }
  get ip() {
    return this.req.headers.get('cf-connecting-ip')
      ?? this.req.headers.get('x-real-ip')
      ?? this.req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? null;
  }
  get secure() { return this.scheme === 'https'; }
  get forwarded() {
    return Boolean(
      this.req.headers.get('forwarded')
      ?? this.req.headers.get('x-forwarded-for')
      ?? this.req.headers.get('x-forwarded-proto')
      ?? this.req.headers.get('x-forwarded-host'),
    );
  }
  get env() { return this.context.env; }
  get formData() {
    const type = this.mediaType;
    return type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data';
  }
  get formDataContentType() { return this.formData; }

  get get() { return this.requestMethod === 'GET'; }
  get post() { return this.requestMethod === 'POST'; }
  get put() { return this.requestMethod === 'PUT'; }
  get patch() { return this.requestMethod === 'PATCH'; }
  get delete() { return this.requestMethod === 'DELETE'; }
  get options() { return this.requestMethod === 'OPTIONS'; }
  get head() { return this.requestMethod === 'HEAD'; }

  get urlObject() { return this.context.url; }
}

function parseAccept(value) {
  return (value ?? '*/*')
    .split(',')
    .map((part, index) => {
      const [type, ...parameters] = part.trim().toLowerCase().split(';');
      const quality = Number(parameters.find((parameter) => parameter.trim().startsWith('q='))?.trim().slice(2) ?? 1);
      return { type: type.trim(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter(({ type, quality }) => type && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ type }) => type);
}

function mediaType(value) {
  return value?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

function mediaTypeMatches(accepted, requested) {
  const candidate = mediaType(requested);
  if (!candidate) return false;
  if (accepted === '*/*' || accepted === candidate) return true;
  const [acceptedType, acceptedSubtype] = accepted.split('/');
  const [candidateType, candidateSubtype] = candidate.split('/');
  return acceptedType === candidateType && acceptedSubtype === '*';
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

const requestCallable = (...args) => currentContext().req;
export const request = new Proxy(requestCallable, {
  get(target, key, receiver) {
    if (key === 'name' || key === 'length' || key === 'prototype') return Reflect.get(target, key, receiver);
    if (key === Symbol.toStringTag) return 'JinatraRequestHelper';
    return currentRequestFacade()[key];
  },
});

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
