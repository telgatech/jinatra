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
c.param('id')       // one route parameter
c.param()           // all route parameters
c.query('page')     // one query value
c.query()           // all query values
c.queries('tag')    // repeated query values
c.header('accept')
c.cookie('theme')
await c.body()
await c.jsonBody()
await c.form()
```

The body parser selects JSON, form data, or text from the request content type. `c.jsonBody()` always parses JSON, while `c.form()` always parses form data.

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
