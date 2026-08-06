# Jinatra

A tiny, self-host-first Sinatra-style web framework built on Web Standards.

Jinatra's core uses Web Platform APIs. Run the same application on Bun, Node, Cloudflare Workers, Deno, or any Fetch-compatible runtime. Signed cookie sessions additionally require Web Crypto.

```js
import { Jinatra } from '@telga/jinatra';

const app = new Jinatra();

app.get('/', (c) => c.html('<h1>Hello</h1>'));
app.get('/products/:id', (c) => c.json({ id: c.param('id') }));

export default app;
```

## Install

```bash
npm install @telga/jinatra
```

## Self-host with Bun

```js
import { Jinatra } from '@telga/jinatra';
import { serve } from '@telga/jinatra/bun';

const app = new Jinatra();
app.get('/api/hello', (c) => c.json({ message: 'Hello' }));

const server = serve(app, {
  port: 3000,
  static: './public',
});

console.log(server.url);
```

Run it:

```bash
bun run server.js
```

## Self-host with Node

```js
import { Jinatra } from '@telga/jinatra';
import { serve } from '@telga/jinatra/node';

const app = new Jinatra();
app.get('/api/hello', (c) => c.json({ message: 'Hello' }));

serve(app, {
  port: 3000,
  static: './public',
});
```

Run it on Node 18 or newer:

```bash
node server.js
```

## Static files

Static files belong to the self-host adapter, not the runtime-neutral core.

```js
serve(app, {
  static: {
    directory: './public',
    index: 'index.html',
    spa: false,
    fallthrough: true,
    cacheControl: 'public, max-age=3600',
    dotfiles: false,
    first: false,
  },
});
```

By default, Jinatra routes have priority. When the app returns `404`, the adapter tries the static directory. Set `first: true` to check static files before application routes. Set `spa: true` to fall back to the index file for unmatched GET/HEAD paths.

The adapters include path-traversal protection, common MIME types, `HEAD` support, content length, and optional cache headers.

## Routing

```js
app.get('/items', handler);
app.post('/items', handler);
app.put('/items/:id', handler);
app.patch('/items/:id', handler);
app.delete('/items/:id', handler);
app.options('/items', handler);
app.head('/items', handler);
app.all('/health', handler);
```

Named parameters match one segment. A trailing slash is accepted.

```js
app.get('/users/:userId/posts/:postId', (c) => {
  return c.json({
    userId: c.param('userId'),
    postId: c.param('postId'),
  });
});
```

A wildcard captures the remaining path as `wildcard`:

```js
app.get('/files/*', (c) => c.text(c.param('wildcard')));
```

## Context API

Handlers receive a context object, normally called `c`:

```js
c.req
c.env
c.executionCtx
c.url
c.state
c.session
c.flash

c.param('id')
c.param()
c.query('search')
c.query()
c.queries('tag')
c.header('authorization')
await c.body()

c.json(data, status, headers)
c.text(text, status, headers)
c.html(html, status, headers)
c.redirect('/login', 302)
c.waitUntil(promise)
```

`c.state` is request-local mutable storage shared by hooks and route handlers; it is not persisted between requests.

A plain object is returned as JSON, a string as text, and `undefined` as `204 No Content`.

## Cookie sessions

Configure signed, cookie-backed sessions when creating the app. Session data is visible to the client, so do not store secrets in it.

```js
const app = new Jinatra({
  session: {
    secret: process.env.SESSION_SECRET,
    secure: true,
    maxAge: 60 * 60 * 24,
  },
});

app.post('/login', (c) => {
  c.session.set('userId', 42);
  return c.json({ ok: true });
});

app.get('/me', (c) => c.json({ userId: c.session.get('userId') }));
```

Sessions use an HMAC-signed cookie by default named `jinatra_session`, with `HttpOnly`, `SameSite=Lax`, and `/` path defaults. Use `c.session.delete(name)` or `c.session.clear()` to remove session data. Web Crypto support is required.

Flash messages use the session and live for one request:

```js
c.flash('notice', 'Profile saved'); // available on the next request
const notice = c.flash('notice');   // reads and consumes it
const all = c.flash();              // reads and consumes all messages
```

## Before and after hooks

```js
app.before((c) => {
  c.state.startedAt = performance.now();
});

app.after((c, response) => {
  const headers = new Headers(response.headers);
  headers.set('x-powered-by', 'Jinatra');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
```

A before hook can stop the request by returning a `Response`:

```js
function requireAuth(c) {
  if (!c.header('authorization')) {
    return c.json({ error: 'Authentication required' }, 401);
  }
}

app
  .post('/products', createProduct)
  .beforeRoute(requireAuth)
  .afterRoute(disableCache);
```

After hooks receive `(context, response)` and run in reverse order.

## Errors and 404s

```js
app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  return c.json({ error: error.message }, 500);
});
```

## Cloudflare Workers

Cloudflare is a supported deployment target, but it is not assumed by Jinatra's core.

A Worker can export the app directly:

```js
import { Jinatra } from '@telga/jinatra';

const app = new Jinatra();
app.get('/api/hello', (c) => c.json({ message: 'Hello' }));

export default app;
```

Bindings remain available through `c.env`, including D1:

```js
app.get('/api/products', async (c) => {
  const result = await c.env.DB
    .prepare('SELECT id, name FROM products ORDER BY id')
    .all();

  return c.json(result.results);
});
```

### Cloudflare static assets

Use Cloudflare's deployment configuration for static files:

```jsonc
{
  "main": "worker.js",
  "compatibility_date": "2026-08-06",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"]
  }
}
```

This lets Cloudflare serve static assets itself and invoke Jinatra only for `/api/*`.

When Worker-first routing is required, Jinatra provides an optional adapter:

```js
import { withAssets } from '@telga/jinatra/cloudflare';
import app from './app.js';

export default withAssets(app, { binding: 'ASSETS' });
```

The adapter asks Jinatra first and forwards `404` responses for GET/HEAD requests to the configured Assets binding.

## Deno and other Fetch runtimes

No Jinatra-specific adapter is required when the runtime already accepts a Fetch handler:

```js
Deno.serve((request) => app.fetch(request));
```

## Package exports

```js
import { Jinatra, Context } from '@telga/jinatra';
import { serve } from '@telga/jinatra/bun';
import { serve } from '@telga/jinatra/node';
import { withAssets } from '@telga/jinatra/cloudflare';
```

`Jinatra` is the primary application class. `App` remains available as a backwards-compatible alias.

Runtime-specific code is isolated in subpath exports, so importing the core does not pull filesystem, Node, Bun, or Cloudflare APIs into your application.

## Included examples

```text
examples/example.js
examples/bun-server.js
examples/node-server.js
examples/cloudflare-worker.js
examples/ejs-server.js
examples/public/index.html
examples/public/styles.css
examples/views/home.ejs
examples/views/layout.ejs
wrangler.example.jsonc
```

Run locally from this repository:

```bash
cd examples
bun run bun-server.js
# or
node node-server.js
```

Then open `http://localhost:3000` and `http://localhost:3000/api`. The example also includes `GET`, `POST`, and `DELETE /api/session` to demonstrate cookie sessions.

## Tests

Run the feature test suite with Node, and with Bun when available:

```bash
npm test
npm run test:bun
```

The suite covers routing, contexts, hooks, responses, errors, sessions, flash messages, EJS rendering, static files, and platform adapters.

## EJS views

Jinatra can render EJS templates from a conventional `views/` directory when self-hosted with Bun or Node. EJS support is isolated behind the `@telga/jinatra/ejs` export so the routing core stays runtime-neutral.

Install both packages:

```bash
npm install @telga/jinatra
```

Project layout:

```text
app/
├── server.js
├── public/
│   └── styles.css
└── views/
    ├── layout.ejs
    └── home.ejs
```

Configure the renderer in the self-host adapter:

```js
import { Jinatra } from '@telga/jinatra';
import { serve } from '@telga/jinatra/node';
import { createEjsRenderer } from '@telga/jinatra/ejs';

const app = new Jinatra();

app.get('/', (c) => c.render('home', {
  title: 'My application',
  heading: 'Welcome',
  products: [],
}));

serve(app, {
  port: 3000,
  static: './public',
  views: createEjsRenderer({
    directory: './views',
    layout: 'layout',
  }),
});
```

Views receive the data passed to `c.render()`; the context is not injected automatically. Pass it explicitly through `locals` when needed:

```js
return c.render('home', data, {
  locals: { c },
});
```

A view omits the extension by default:

```js
return c.render('products/show', { product });
```

This loads `views/products/show.ejs`. View names are restricted to the configured directory.

The layout receives the rendered view as `body`:

```ejs
<!doctype html>
<html>
  <head><title><%= title %></title></head>
  <body><%- body %></body>
</html>
```

Disable the layout for one response or customize the HTTP response:

```js
return c.render('fragment', data, {
  layout: false,
  status: 201,
  headers: {
    'cache-control': 'no-store',
  },
});
```

Use a different layout:

```js
return c.render('admin/dashboard', data, {
  layout: 'admin-layout',
});
```

Templates are cached when `NODE_ENV=production`. Override this explicitly during development or production:

```js
createEjsRenderer({
  directory: './views',
  layout: 'layout',
  cache: false,
});
```

EJS includes work because the renderer supplies each template's filename to EJS. Keep included files under the configured views directory.

### Cloudflare note

Runtime filesystem rendering is intentionally a self-host feature. Cloudflare Workers do not provide a normal `views/` directory at request time. For Workers, precompile or bundle templates during the build, or provide a custom renderer through the execution environment. Jinatra does not force a Cloudflare-specific view mechanism into its core.

## Design goals

- Self-hosting is the default.
- Core routing is built only on Web Standards.
- Runtime and platform integrations stay in adapters.
- Small enough to read and understand completely.

## License

MIT
