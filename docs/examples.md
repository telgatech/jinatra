# Examples

The repository includes runnable examples for the main deployment targets.

## Minimal JSX app

[`examples/minimal.tsx`](https://github.com/telgatech/jinatra/blob/main/examples/minimal.tsx) shows the shortest path to a JSX app running on Bun.

```tsx
import { app } from 'jinatra'
import { serve } from 'jinatra/bun'

get('/', () => <h1>Jinatra</h1>)
get('/hello/:name', () => <h1>Hello {params.name}</h1>)

serve(app, { port: 3000 })
```

## Node server

[`examples/node-server.js`](https://github.com/telgatech/jinatra/blob/main/examples/node-server.js) uses the Node adapter and native static file serving.

## Cloudflare Worker

[`examples/cloudflare-worker.js`](https://github.com/telgatech/jinatra/blob/main/examples/cloudflare-worker.js) demonstrates a Worker export, cron handling, and Workers Static Assets.

## Run the tests

```bash
npm test
```

The test suite exercises routing, request context, middleware, responses, sessions, Cloudflare behavior, JSX SSR, and the Node adapter.
