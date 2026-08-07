# Middleware & errors

Middleware is registered with `use()`. A middleware handler receives the context and a `next` function.

```js
app.use(async (c, next) => {
  const started = performance.now()
  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('x-response-time', `${performance.now() - started}ms`)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
})
```

Middleware runs before route handlers and can short-circuit by returning a response without calling `next()`.

## Before and after hooks

Use `before()` for application-wide pre-processing and `after()` for response post-processing:

```js
app.before((c) => {
  c.state.requestId = crypto.randomUUID()
})

app.after((c, response) => {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', c.state.requestId)
  return new Response(response.body, { status: response.status, headers })
})
```

Hooks can be chained. Route-specific hooks are available with `beforeRoute()` and `afterRoute()`.

## Custom not-found and error handlers

```js
import { json } from 'jinatra'

app.notFound((c) => json({ error: 'not found', path: c.url.pathname }, 404))

app.onError((error) => {
  console.error(error)
  return json({ error: 'internal server error' }, 500)
})
```

`HTTPError` responses expose their message by default for status codes below 500. Unexpected errors are logged and become a generic `500` response unless an error handler replaces it.

## Background work

Use `waitUntil()` when the runtime supplies an execution context:

```js
import { waitUntil } from 'jinatra'

app.post('/events', async () => {
  waitUntil(writeAuditEvent())
  return { accepted: true }
})
```
