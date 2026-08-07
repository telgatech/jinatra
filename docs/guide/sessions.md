# Sessions

Jinatra includes optional signed cookie sessions. Enable them on an app with a secret:

```js
const app = new Jinatra({
  session: {
    secret: process.env.SESSION_SECRET,
    name: 'session',
    secure: true,
  },
})
```

The session is available on the request context:

```js
app.post('/login', async (c) => {
  const user = await authenticate(await c.body())
  c.session.set('userId', user.id)
  return c.redirect('/account')
})

app.get('/account', (c) => {
  const userId = c.session.get('userId')
  if (!userId) return c.redirect('/login')
  return { userId }
})
```

Session values are signed with HMAC-SHA-256 and stored in an HTTP cookie. Options include `name`, `secret`, `path`, `domain`, `maxAge`, `httpOnly`, `secure`, and `sameSite`.

## Flash messages

Flash values are available for the next request:

```js
c.flash('notice', 'Profile saved')

const notice = c.flash('notice')
```

Call `c.flash()` with no arguments to consume all current flash values. Sessions must be enabled before using flash messages.
