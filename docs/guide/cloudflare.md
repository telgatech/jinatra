# Cloudflare Workers

Jinatra apps are directly compatible with Cloudflare Workers.

## Basic Worker

```js
import { Jinatra } from 'jinatra'

const app = new Jinatra()
app.get('/', () => 'Hello from a Worker')

export default { fetch: app.fetch }
```

## Static Assets

Use `withAssets()` to fall back to a Workers Static Assets binding after Jinatra returns a `404`:

```js
import { Jinatra } from 'jinatra'
import { withAssets } from 'jinatra/cloudflare'

const app = new Jinatra()
app.get('/api/health', () => ({ ok: true }))

export default withAssets(app)
```

The default binding name is `ASSETS`. Configure assets in `wrangler.jsonc`:

```jsonc
{
  "name": "my-jinatra-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./public"
  }
}
```

Pass `{ binding: 'STATIC' }` to `withAssets()` when the binding has a different name. Asset fallback is enabled for `GET` and `HEAD` by default.

## Cron handlers

Register a handler in application code and configure the trigger in Wrangler:

```js
const app = new Jinatra()

app.cron('0 * * * *', async (controller, env, ctx) => {
  await env.DB.prepare('...').run()
})

export default app.worker()
```

`worker()` returns a module export with `fetch` and, when cron handlers exist, `scheduled`. `withAssets()` preserves the scheduled export.

## Queue consumers

Register a handler for the Cloudflare queue name. Jinatra invokes it once for each message in the incoming batch:

```js
const app = new Jinatra()

app.queue('jobs', async (message, env, ctx) => {
  const job = message.body
  await processJob(job, env)
})

export default app.worker()
```

The handler receives Cloudflare's message object, so `message.body`, `message.id`, `message.attempts`, `message.ack()`, and `message.retry()` remain available. Queue producer bindings are ordinary environment bindings:

```js
await env.JOBS.send({ type: 'send-email', userId: 123 })
```

Configure the queue consumer and producer binding in Wrangler. Jinatra only dispatches the `queue(batch, env, ctx)` event; it does not manage queue infrastructure.
