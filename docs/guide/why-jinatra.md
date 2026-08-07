# Why Jinatra?

Jinatra is for small web applications that should feel like a few clear functions instead of a framework configuration project.

## The shape of the API

```js
import { app } from 'jinatra'
import { serve } from 'jinatra/bun'

get('/hello/:name', () => `Hello, ${params.name}!`)

serve(app, { port: 3000 })
```

A route can return a string, an object, JSX, or a native `Response`. Jinatra normalizes the result into a Fetch response.

## A focused core

- **Fetch-native:** the core works with `Request`, `Response`, and `fetch`.
- **Straightforward routing:** familiar method names and request-scoped helpers.
- **Runtime adapters:** use Bun's server, Node's HTTP server, or export directly to Workers.
- **Built-in JSX:** render escaped HTML without React or a template dependency.
- **Progressive APIs:** start with the default `app`, then use `new Jinatra()` when you need isolation or multiple apps.

Jinatra does not try to replace every tool in the JavaScript ecosystem. It keeps the application layer small and leaves databases, validation, authentication, and deployment services to focused libraries.
