import { Jinatra } from 'jinatra';

export const app = new Jinatra({
  session: {
    // Set SESSION_SECRET in production; this fallback is only for the demo.
    secret: globalThis.process?.env?.SESSION_SECRET ?? 'development-only-secret',
  },
});

app.before((c) => {
  c.state.startedAt = performance.now();
});

app.get('/api', () => ({ name: 'Jinatra', version: '0.1.0' }));

app.get('/api/hello/:name', (c) => ({
  message: `Hello, ${c.param('name')}!`,
  query: c.query(),
}));

app.post('/api/echo', async (c) => {
  c.status(201);
  return { body: await c.body() };
});

app.get('/api/session', (c) => ({
  userId: c.session.get('userId') ?? null,
  notice: c.flash('notice') ?? null,
}));

app.post('/api/session', (c) => {
  c.session.set('userId', c.query('userId') ?? 'demo');
  c.flash('notice', 'Session updated');
  return { userId: c.session.get('userId') };
});

app.delete('/api/session', (c) => {
  c.session.clear();
  return { ok: true };
});

app.after((c, response) => {
  const headers = new Headers(response.headers);
  headers.set('x-powered-by', 'Jinatra');
  headers.set('x-response-time-ms', String(Math.round(performance.now() - c.state.startedAt)));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export default app;
