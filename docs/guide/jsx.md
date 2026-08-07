# JSX SSR

Jinatra includes a small JSX runtime for server-rendered HTML. It is designed for pages and fragments, not browser hydration.

## Configure JSX

Set `jsxImportSource` to `jinatra`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jinatra"
  }
}
```

The package exposes both `jinatra/jsx-runtime` and `jinatra/jsx-dev-runtime`, so TypeScript and modern bundlers can use automatic JSX.

## Components

Function components receive props and can be nested:

```tsx
function Layout({ title, children }) {
  return (
    <html lang="en">
      <head><title>{title}</title></head>
      <body>{children}</body>
    </html>
  )
}

function Home() {
  return (
    <Layout title="Home">
      <h1>Welcome</h1>
      <p>Rendered on the server.</p>
    </Layout>
  )
}

app.get('/', () => <Home />)
```

Supported features include intrinsic elements, fragments, arrays, async components, boolean attributes, `className`, object styles, and nullish children.

## Escaping

Text and attributes are escaped by default:

```tsx
const userName = '<script>alert(1)</script>'

const page = <h1>Hello, {userName}</h1>
// <h1>Hello, &lt;script&gt;alert(1)&lt;/script&gt;</h1>
```

Use `raw()` only for HTML you fully trust:

```tsx
import { raw } from 'jinatra'

const trusted = <article>{raw('<strong>Trusted markup</strong>')}</article>
```

Event props such as `onClick` are ignored during server rendering. There is no client-side runtime or hydration payload.
