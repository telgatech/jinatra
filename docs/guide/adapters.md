# Runtime adapters

Jinatra's core speaks Fetch. Adapters connect the same app to a local server without changing route code.

## Bun

```js
import { app } from 'jinatra'
import { serve } from 'jinatra/bun'

serve(app, {
  port: 3000,
  static: './public',
})
```

The Bun adapter uses `Bun.serve()`, supports static files, and exposes `listen` as an alias for `serve`.

## Node

```js
import { app } from 'jinatra'
import { serve } from 'jinatra/node'

serve(app, {
  port: 3000,
  static: './public',
})
```

The Node adapter bridges Node's HTTP server to Web `Request` and `Response` objects. It requires Node 18 or newer.

## Any Fetch runtime

The core app can be exported directly:

```js
import { Jinatra } from 'jinatra'

const app = new Jinatra()
app.get('/', () => 'Hello')

export default { fetch: app.fetch }
```

`app.fetch(request, env, executionContext)` is the portable integration point for runtimes that already provide a Fetch server.

## Static files

The Bun and Node adapters can serve a directory after Jinatra returns a 404:

```js
serve(app, {
  static: {
    directory: './public',
    cacheControl: 'public, max-age=3600',
  },
})
```

Static serving includes MIME types, `HEAD`, cache headers, traversal protection, and optional SPA fallback configuration.
