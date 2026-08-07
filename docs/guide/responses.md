# Responses

Jinatra normalizes common JavaScript values into native `Response` objects.

| Return value | Response |
| --- | --- |
| JSX | Escaped `text/html` |
| string or number | `text/plain` |
| object or array | JSON |
| `null` or `undefined` | Empty `204` |
| `Response` | Passed through unchanged |

```js
app.get('/plain', () => 'hello')
app.get('/data', () => ({ version: 1 }))
app.get('/native', () => new Response('ok', { status: 202 }))
```

## Response helpers

Use helpers when you need status codes or headers:

```js
import { html, json, redirect, text } from 'jinatra'

app.get('/created', () => json({ created: true }, 201))
app.get('/page', () => html('<h1>Trusted HTML</h1>'))
app.get('/download', () => text('file contents', 200, {
  'content-disposition': 'attachment; filename="file.txt"',
}))
app.get('/old', () => redirect('/new'))
```

`html()` accepts JSX or a string. Use `raw()` only when inserting trusted HTML into a JSX tree; normal JSX text and attributes are escaped.

## Status helper

Set a status for the response returned by the current handler:

```js
import { status } from 'jinatra'

app.post('/users', async () => {
  const user = await createUser()
  status(201)
  return user
})
```

A handler can also use `c.status(201)`, `c.html()`, `c.json()`, `c.text()`, or `c.redirect()`.

## Errors

Throw an `HTTPError` for an intentional error response:

```js
import { httpError } from 'jinatra'

app.get('/private', () => {
  throw httpError(401, 'Sign in required')
})
```

Use `app.notFound()` and `app.onError()` to customize fallback responses.
