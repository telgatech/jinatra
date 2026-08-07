# API reference

Jinatra exposes a small set of named exports from the root package.

## Application

### `Jinatra`

Create an isolated application instance.

```js
const app = new Jinatra(options?)
```

Methods:

- `get(path, ...handlers)`
- `post(path, ...handlers)`
- `put(path, ...handlers)`
- `patch(path, ...handlers)`
- `delete(path, ...handlers)`
- `options(path, ...handlers)`
- `head(path, ...handlers)`
- `any(path, ...handlers)` / `all(path, ...handlers)`
- `use(...handlers)`
- `before(...handlers)` / `after(...handlers)`
- `beforeRoute(...handlers)` / `afterRoute(...handlers)`
- `notFound(handler)`
- `onError(handler)`
- `static(directory, options?)`
- `session(options)`
- `cron(expression, ...handlers)`
- `worker()`
- `fetch(request, env?, executionContext?)`

`App` is an alias for `Jinatra`.

### `Context`

Handlers receive a context with `req`, `env`, `executionCtx`, `url`, `params`, `state`, and the request methods described in [Request context](/guide/request-context).

## Request helpers

The root package exports request-scoped helpers:

- `params`
- `query`
- `body()`
- `form()`
- `json()` (request-body parser when called without arguments)
- `headers`
- `cookies`
- `request()`
- `env()`
- `status(code?)`
- `waitUntil(promise)`

Property access and calls are both supported for parameter, query, header, and cookie helpers: `params.id` or `params('id')`.

## Response helpers

- `html(value, status?, headers?)`
- `json(value, status?, headers?)` (explicit JSON `Response`; ordinary objects can be returned directly)
- `text(value, status?, headers?)`
- `redirect(location, status?)`
- `raw(value)`
- `httpError(status, message?, options?)`
- `normalizeResponse(value, context)`

`HTTPError` is the corresponding error class.

## Package entry points

| Import | Purpose |
| --- | --- |
| `jinatra` | Core app, helpers, responses, and JSX exports |
| `jinatra/bun` | `serve()` and `listen()` for Bun |
| `jinatra/node` | `serve()` and `listen()` for Node |
| `jinatra/cloudflare` | `withAssets()` for Workers Static Assets |
| `jinatra/jsx-runtime` | Automatic JSX runtime |
| `jinatra/jsx-dev-runtime` | Development JSX runtime |
