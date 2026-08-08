# Routing

Routes are registered on an app with an HTTP method and a path. Methods are matched in registration order.

```js
const app = new Jinatra()

app.get('/', () => 'home')
app.post('/users', () => 'create user')
app.put('/users/:id', (c) => `update ${c.param('id')}`)
app.delete('/users/:id', (c) => `delete ${c.param('id')}`)
```

Supported methods are `get`, `post`, `put`, `patch`, `delete`, `options`, `head`, and `any`. `all` is an alias for `any`.

## Parameters

Use `:name` for a single path segment and `*` for a wildcard:

```js
app.get('/posts/:id', (c) => ({ id: c.param('id') }))
app.get('/files/*', (c) => c.param('wildcard'))
app.get('/optional', (c) => c.param('name', 'anonymous'))
```

A missing named parameter returns `null` by default. Pass a second argument to provide a fallback:

```js
c.param('name', 'anonymous')
```

The `params` helper provides the same values without passing a context around:

```js
app.get('/users/:id', () => ({
  id: params('id', 'unknown'),
}))
```

Paths may end with an optional trailing slash. Parameters are URL-decoded and invalid encoded parameters return a `400` response.

## Route hooks

Attach hooks to the route most recently registered:

```js
app.get('/admin', requireAuth, () => 'dashboard')
  .beforeRoute((c) => {
    c.state.startedAt = performance.now()
  })
  .afterRoute((c, response) => {
    const headers = new Headers(response.headers)
    headers.set('x-route-time', String(performance.now() - c.state.startedAt))
    return new Response(response.body, { status: response.status, headers })
  })
```

You can also register application-wide `before()` and `after()` handlers. See [Middleware & errors](/guide/middleware).

## HEAD behavior

If a `HEAD` route is not registered, Jinatra uses the matching `GET` route and returns the response without a body in the runtime adapter.
