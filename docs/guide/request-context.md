# Request context

Every handler receives a context as its first argument. The context is the explicit, runtime-independent API for the current request.

```js
app.get('/search', (c) => ({
  method: c.req.method,
  term: c.query('q'),
  userAgent: c.header('user-agent'),
}))
```

## Context properties

| Property | Description |
| --- | --- |
| `c.req` | The native `Request` object |
| `c.env` | Runtime environment bindings or variables |
| `c.executionCtx` | Runtime execution context, when provided |
| `c.url` | Parsed `URL` for the request |
| `c.params` | Object containing route parameters |
| `c.state` | Mutable request-scoped state |
| `c.session` | Cookie session, when sessions are enabled |

## Context methods

```js
c.param('id')                    // route parameter, or null
c.param('id', 'new')             // route parameter with fallback
c.param()                        // all route parameters
c.query('page')                  // one query value
c.query()                        // all query values
c.queries('tag')                 // repeated query values
c.header('accept')               // one request header
c.header()                       // all request headers
c.cookie('theme')                // one cookie
c.cookie()                       // all cookies
await c.body()                   // JSON, form data, or text by content type
await c.jsonBody()               // always parse JSON
await c.form()                   // parse form data into an object
c.json(data, status?, headers?)  // explicit JSON response
c.html(value, status?, headers?) // HTML response
c.text(value, status?, headers?) // text response
c.redirect(location, status?)   // redirect response
c.status(code?)                 // get or set response status
c.waitUntil(promise)             // schedule background work

c.accept                         // accepted media types
c.accepts('text/html')           // content negotiation check
c.preferredType(types)           // best matching media type
c.url                           // URL('https://example.com/users/42?page=2')
c.path                          // '/users/42'
c.pathInfo                      // '/users/42' (pathname alias)
c.queryString                   // 'page=2'
c.scheme                        // 'https'
c.scriptName                    // mounted script prefix
c.host                          // hostname
c.hostWithPort                  // hostname and port
c.port                          // numeric port
c.requestMethod                 // HTTP method
c.method                        // HTTP method alias
c.contentLength                 // Content-Length, or null
c.referrer                      // Referer header, or /
c.userAgent                     // User-Agent header
c.headers                       // all request headers
c.cookies                       // all request cookies
c.ip                            // client IP from proxy headers
c.secure                        // HTTPS flag
c.forwarded                     // forwarded request flag
c.xhr                           // XMLHttpRequest flag
c.formData                      // form content-type flag
```

Request inspection properties and methods are available directly on the context:

| Helper | Description |
| --- | --- |
| `c.accept` | Ordered accepted media types |
| `c.accepts(type)` | Whether the client accepts a media type |
| `c.preferredType(types)` | Best matching type from the supplied choices |
| `c.scheme` | `http` or `https` |
| `c.scriptName` | Mounted script prefix, or an empty string |
| `c.path`, `c.pathInfo` | Request pathname |
| `c.url` | Parsed request `URL` |
| `c.host`, `c.hostWithPort`, `c.port` | Host and port information |
| `c.requestMethod`, `c.method` | HTTP method |
| `c.queryString` | Raw query string without `?` |
| `c.contentLength` | Parsed `Content-Length`, or `null` |
| `c.mediaType` | Request media type without parameters |
| `c.referrer`, `c.referer` | Referring URL, or `/` when absent |
| `c.userAgent` | User-agent header |
| `c.headers`, `c.cookies` | Header and cookie objects |
| `c.ip` | Client IP from common proxy headers |
| `c.secure`, `c.forwarded`, `c.xhr` | HTTPS, proxy, and XMLHttpRequest flags |
| `c.formData` | Whether the content type is form data |

The body parser selects JSON, form data, or text from the request content type. `c.jsonBody()` always parses JSON, while `c.form()` always parses form data.

## Request facade

For a compact, request-centric API, use the context directly (or the global `request` helper):

```js
app.get('/inspect/:id', (c) => ({
  acceptsHtml: c.accepts('text/html'),
  preferredType: c.preferredType(['application/json', 'text/html']),
  method: c.requestMethod,
  path: c.path,
  id: c.params.id,
  ip: c.ip,
  secure: c.secure,
}))
```

The facade includes:

- `accept` — ordered accepted media types
- `accepts(type)` and `preferredType(types)` — content negotiation
- `body` — a promise for the parsed request body
- `scheme`, `host`, `port`, `path`, `pathInfo`, `url`, `queryString`
- `requestMethod`, `contentLength`, `mediaType`, `referrer`, `userAgent`
- `params`, `query`, `cookies`, `headers`, `env`, and bracket parameter access
- `ip`, `secure`, `forwarded`, `xhr`, and `formData` booleans

The global `request` helper mirrors these inspection properties and methods, and additionally supports bracket access to route parameters such as `request['id']`. Its `request.body` property is asynchronous; use `await request.body`. The global `request()` call remains available when you need the raw Fetch `Request` object.

## JSON request bodies

`c.req.json()` returns the parsed JavaScript value. Do not call `JSON.parse()` again:

```js
app.post('/users', async (c) => {
  const input = await c.req.json()
  // input is already an object, array, string, number, boolean, or null
  return { received: input }
})
```

These are equivalent JSON parsing forms:

```js
await c.req.json()
await c.jsonBody()
await body() // when Content-Type is application/json
await json() // the no-argument request helper
```

The request must have an `application/json` content type for automatic body parsing. Invalid JSON throws and is handled by the app error handler.

## File uploads

`multipart/form-data` is parsed with the platform's native `FormData` API:

```js
app.post('/upload', async (c) => {
  const form = await c.req.formData()
  const title = form.get('title')
  const file = form.get('file')

  if (!(file instanceof File)) return c.text('file is required', 400)

  const bytes = await file.arrayBuffer()
  console.log(file.name, file.type, bytes.byteLength)

  return {
    title,
    filename: file.name,
    size: file.size,
    type: file.type,
  }
})
```

For a convenient object of fields, use `c.form()` or `body()`. Use `c.req.formData()` when you need repeated fields, `File` values, or the full `FormData` API. When sending a `FormData` object from the browser, do not set `Content-Type` manually; the browser adds the multipart boundary.

## Request helpers

For Bun and Node, AsyncLocalStorage makes concise helpers safe across `await` boundaries:

```js
import { body, params, query } from 'jinatra'

app.post('/users/:id', async () => {
  const data = await body()
  return { id: params.id, search: query('search'), data }
})
```

The explicit context API remains available in every Fetch runtime. It is the recommended form for portable Cloudflare Worker code that does not have an async context implementation.
