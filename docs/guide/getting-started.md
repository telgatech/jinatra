# Getting started

## Install

```bash
npm install jinatra
```

Or with Bun:

```bash
bun add jinatra
```

Jinatra requires Node 18 or a runtime with the Fetch API. Bun is the shortest path from a file to a running server.

## Create an app

Create `server.js`:

```js
import { app } from 'jinatra'
import { serve } from 'jinatra/bun'

get('/', () => 'Hello from Jinatra')

get('/health', () => ({ ok: true }))

serve(app, { port: 3000 })
```

Run it with:

```bash
bun run server.js
```

Open `http://localhost:3000` in your browser.

::: tip The default app and global helpers
`app` is Jinatra's default singleton app. Importing `jinatra` installs that app's route verbs (`get`, `post`, `put`, and so on) and request helpers on `globalThis`, so they can be used without importing each one. Pass the same `app` to your runtime adapter. For isolated apps, create `new Jinatra()` and use its methods directly instead.
:::

## Use an explicit app

The default app is convenient for a single application. For tests, libraries, or multiple apps, create an instance explicitly. An explicit instance keeps its routes separate, so use its methods directly:

```js
import { Jinatra } from 'jinatra'
import { serve } from 'jinatra/bun'

const app = new Jinatra()

app.get('/', () => 'Hello from an explicit app')

serve(app)
```

## TypeScript and JSX

Configure the automatic JSX runtime in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "jinatra"
  }
}
```

Then return JSX directly from a route:

```tsx
const Page = () => <main><h1>Jinatra</h1></main>

app.get('/', () => <Page />)
```

JSX is rendered on the server. It is not hydrated in the browser.
