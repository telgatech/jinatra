# Jinatra

Jinatra is a tiny Fetch-native web framework. It provides a small router, request-scoped helpers, middleware, Bun static files, and an escaped JSX SSR runtime without a template engine dependency.

## A minimal app

```tsx
import { app } from "jinatra";
import { serve } from "jinatra/bun";

const Layout = ({ children }) => <html><body>{children}</body></html>;

get("/", () => <Layout><h1>Jinatra</h1></Layout>);

get("/hello/:name", () => <h1>Hello {params.name}</h1>);

post("/echo", async () => ({ body: await body() }));

serve(app, { port: 3000 });
```

Configure automatic JSX in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jinatra"
  }
}
```

Importing the root package also exposes the default app's route verbs and request helpers on `globalThis`, so `get`, `post`, `params`, and `body` can be used without importing each one. Returning an object automatically creates a JSON response; `json()` is mainly the request-body parser when called without arguments. Explicit named imports remain available. The package exports `jsx-runtime` and `jsx-dev-runtime`; JSX is rendered on the server and never hydrated. A JSX value becomes escaped `text/html`, strings become `text/plain`, objects become JSON, and `Response` values pass through unchanged.

## Routing and helpers

```js
import { Jinatra } from 'jinatra';

const app = new Jinatra();

app.get('/users/:id', async () => {
  return { id: params.id, search: query('search') };
});

app.post('/users', async () => {
  const data = await body();
  status(201);
  return data;
});
```

Methods are `get`, `post`, `put`, `patch`, `delete`, `any` (and the alias `all`). Parameters are available as `params.id` or `params('id')`; `c.param('id', 'fallback')` accepts a default and missing values return `null`. Use `app.mount('/api', api)` to mount another Fetch-compatible app below a prefix. The other request helpers are `query`, `body`, `form`, `json`, `headers`, and `cookies`. Response helpers are `status`, `redirect`, `html`, `text`, and `json`.

Handlers may also receive the request context as their first argument (`c.req`, `c.url`, `c.state`, and the equivalent context methods remain available). The context itself provides a compact request surface with `accept`, `preferredType()`, `path`, `ip`, and `secure`; the global `request` helper also supports bracket access to route parameters.

## Middleware, errors, and static files

```js
app.use(async (c, next) => {
  const started = performance.now();
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('x-time', String(performance.now() - started));
  return new Response(response.body, { status: response.status, headers });
});

app.get('/private', requireAuth, handler);
app.notFound((c) => {
  c.status(404);
  return { error: 'missing' };
});
app.onError((error, c) => {
  c.status(500);
  return { error: error.message };
});
app.static('./public');

import { serve } from 'jinatra/bun';
serve(app, { port: 3000 });
```

`static()` and the Bun adapter use `Bun.file()` and include MIME types, `HEAD`, cache headers, and traversal protection.

## JSX

Intrinsic elements, function components, fragments, arrays, nested components, boolean attributes, `className`, object styles, and nullish children are supported. Text and attributes are escaped by default:

```tsx
const name = '<script>alert(1)</script>';
const page = <><h1>{name}</h1><input disabled /></>;
```

Use `raw('<strong>trusted</strong>')` only for trusted HTML.

## Cloudflare Workers

`app.fetch` is directly compatible with Workers:

```js
import { Jinatra } from 'jinatra';

const app = new Jinatra();
app.get('/', () => 'Hello from a Worker');

export default { fetch: app.fetch };
```

Use `worker()` when the application has Cron or Queue handlers. The `scheduled` and `queue` exports are omitted when there are no corresponding handlers:

```js
const app = new Jinatra();

app.cron('0 * * * *', async (controller, env, ctx) => {
  await env.DB.prepare('...').run();
});

export default app.worker();
```

`scheduled()` compares `controller.cron` with the expression registered by `app.cron()` and dispatches only the matching handler. Queue consumers are registered by name and receive each message from Cloudflare's batch:

```js
app.queue('jobs', async (message, env, ctx) => {
  await processJob(message.body, env)
})
```

Queue producers, R2 buckets, D1 databases, and KV namespaces remain ordinary bindings on `env`. Cron expressions and queue consumer configuration remain deployment configuration in `wrangler.toml` or `wrangler.jsonc`; Jinatra only maps events to application code. `withAssets()` preserves the scheduled and queue exports when adding a Workers Static Assets fallback.

Other Fetch runtimes can use `app.fetch(request)` directly. The included Node adapter is a small compatibility adapter; the built-in server path is Bun's `Bun.serve()`.

## Documentation

The full guide is built with VitePress and deployed to GitHub Pages:

```bash
npm run docs:dev       # local docs server
npm run docs:build     # static production build
npm run docs:preview   # preview the production build
```

## Development

```bash
npm test
npm run check
```
