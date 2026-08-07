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
import { app, get } from 'jinatra'
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

## Use an explicit app

The default export is convenient for a single application. For tests, libraries, or multiple apps, create an instance explicitly:

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
