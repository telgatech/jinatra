import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Jinatra } from './src/index.js';
import { createEjsRenderer } from './src/ejs.js';
import { withAssets } from './src/adapters/cloudflare.js';
import { serve as serveNode } from './src/adapters/node.js';
import { serve as serveBun } from './src/adapters/bun.js';

const tests = [
  ['routing and context APIs', testRoutingAndContext],
  ['hooks and response normalization', testHooksAndResponses],
  ['errors and 404 handling', testErrors],
  ['cookie sessions and flash messages', testSessions],
  ['Cloudflare assets adapter', testCloudflareAssets],
  ['EJS rendering', testEjs],
  ['Node adapter and static files', testNodeAdapter],
];

if (globalThis.Bun) tests.push(['Bun adapter', testBunAdapter]);

for (const [name, test] of tests) {
  await test();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} feature tests passed`);

async function testRoutingAndContext() {
  const app = new Jinatra();

  app.get('/users/:id', (c) => c.json({
    id: c.param('id'),
    params: c.param(),
    query: c.query(),
    tags: c.queries('tag'),
    authorization: c.header('authorization'),
  }));
  app.post('/body', async (c) => c.json(await c.body()));
  app.get('/text', (c) => c.text('hello'));
  app.get('/html', (c) => c.html('<h1>Hello</h1>'));
  app.get('/redirect', (c) => c.redirect('/text'));
  app.get('/head', (c) => c.text('head'));
  app.head('/head', () => new Response('explicit head'));
  app.all('/all', (c) => c.text(c.req.method));

  const request = new Request('https://example.test/users/42/?tag=a&tag=b', {
    headers: { authorization: 'Bearer test' },
  });
  const response = await app.fetch(request);
  assert.deepEqual(await response.json(), {
    id: '42',
    params: { id: '42' },
    query: { tag: 'b' },
    tags: ['a', 'b'],
    authorization: 'Bearer test',
  });

  const json = await app.fetch(new Request('https://example.test/body', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  }));
  assert.deepEqual(await json.json(), { ok: true });

  const form = await app.fetch(new Request('https://example.test/body', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Jinatra&mode=test',
  }));
  assert.deepEqual(await form.json(), { name: 'Jinatra', mode: 'test' });

  assert.equal(await (await app.fetch(new Request('https://example.test/text'))).text(), 'hello');
  assert.equal((await app.fetch(new Request('https://example.test/html'))).headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await app.fetch(new Request('https://example.test/redirect'))).status, 302);
  assert.equal((await app.fetch(new Request('https://example.test/all', { method: 'PATCH' }))).status, 200);
  assert.equal((await app.fetch(new Request('https://example.test/head', { method: 'HEAD' }))).status, 200);
}

async function testHooksAndResponses() {
  const events = [];
  const background = [];
  const app = new Jinatra();

  app.before((c) => {
    c.state.started = true;
    events.push('before');
  });
  app.after((c, response) => {
    assert.equal(c.state.started, true);
    events.push('after');
    const headers = new Headers(response.headers);
    headers.set('x-test', 'passed');
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  });
  app.get('/object', (c) => {
    c.waitUntil(Promise.resolve().then(() => background.push('done')));
    return { ok: true };
  });
  app.get('/empty', () => undefined);

  const executionCtx = {
    waitUntil(promise) {
      background.push(promise);
    },
  };
  const response = await app.fetch(new Request('https://example.test/object'), {}, executionCtx);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('x-test'), 'passed');
  assert.deepEqual(events, ['before', 'after']);
  await Promise.all(background);
  assert.equal(background.at(-1), 'done');

  const empty = await app.fetch(new Request('https://example.test/empty'));
  assert.equal(empty.status, 204);
}

async function testErrors() {
  const notFound = new Jinatra();
  notFound.notFound((c) => c.json({ custom: true }, 404));
  const missing = await notFound.fetch(new Request('https://example.test/missing'));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { custom: true });

  const errors = new Jinatra();
  errors.onError((error, c) => c.json({ message: error.message }, 418));
  errors.get('/boom', () => {
    throw new Error('boom');
  });
  const log = console.error;
  console.error = () => {};
  try {
    const response = await errors.fetch(new Request('https://example.test/boom'));
    assert.equal(response.status, 418);
    assert.deepEqual(await response.json(), { message: 'boom' });
  } finally {
    console.error = log;
  }
}

async function testSessions() {
  const app = new Jinatra({ session: { secret: 'test-secret', maxAge: 3600 } });
  app.post('/login', (c) => {
    c.session.set('userId', 42);
    c.flash('notice', 'Logged in');
    return c.json({ ok: true });
  });
  app.get('/account', (c) => c.json({
    userId: c.session.get('userId') ?? null,
    notice: c.flash('notice') ?? null,
  }));
  app.delete('/session', (c) => {
    c.session.clear();
    return c.json({ ok: true });
  });

  const login = await app.fetch(new Request('https://example.test/login', { method: 'POST' }));
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /^jinatra_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=3600/);

  const account = await app.fetch(new Request('https://example.test/account', {
    headers: { cookie },
  }));
  assert.deepEqual(await account.json(), { userId: 42, notice: 'Logged in' });

  const nextCookie = account.headers.get('set-cookie');
  const consumed = await app.fetch(new Request('https://example.test/account', {
    headers: { cookie: nextCookie },
  }));
  assert.deepEqual(await consumed.json(), { userId: 42, notice: null });

  const cleared = await app.fetch(new Request('https://example.test/session', {
    method: 'DELETE',
    headers: { cookie: nextCookie },
  }));
  assert.match(cleared.headers.get('set-cookie'), /Max-Age=0/);
}

async function testCloudflareAssets() {
  const app = new Jinatra();
  app.get('/api', () => ({ ok: true }));
  const wrapped = withAssets(app, { binding: 'ASSETS' });
  const assets = {
    fetch: async () => new Response('asset', { headers: { 'x-asset': 'yes' } }),
  };

  const asset = await wrapped.fetch(new Request('https://example.test/index.html'), { ASSETS: assets });
  assert.equal(await asset.text(), 'asset');
  assert.equal(asset.headers.get('x-asset'), 'yes');

  const api = await wrapped.fetch(new Request('https://example.test/api'), { ASSETS: assets });
  assert.deepEqual(await api.json(), { ok: true });

  const post = await wrapped.fetch(new Request('https://example.test/index.html', { method: 'POST' }), { ASSETS: assets });
  assert.equal(post.status, 404);
}

async function testEjs() {
  const directory = await mkdtemp(join(tmpdir(), 'jinatra-ejs-'));
  try {
    await writeFile(join(directory, 'layout.ejs'), '<main><%- body %></main>');
    await writeFile(join(directory, 'home.ejs'), '<h1><%= title %></h1><p><%= message %></p>');

    const render = createEjsRenderer({ directory, layout: 'layout' });
    const html = await render('home', { title: 'Welcome', message: 'Hello' });
    assert.equal(html, '<main><h1>Welcome</h1><p>Hello</p></main>');

    const withoutLayout = await render('home', { title: 'Welcome', message: 'Hello' }, { layout: false });
    assert.equal(withoutLayout, '<h1>Welcome</h1><p>Hello</p>');
    await assert.rejects(() => render('../outside'), /escapes views directory/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function testBunAdapter() {
  const app = new Jinatra();
  app.get('/health', () => ({ ok: true }));
  const server = serveBun(app, {
    hostname: '127.0.0.1',
    port: 0,
  });

  try {
    const response = await fetch(`${server.url}health`);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.stop(true);
  }
}

async function testNodeAdapter() {
  const directory = await mkdtemp(join(tmpdir(), 'jinatra-static-'));
  const server = serveNode(new Jinatra(), {
    hostname: '127.0.0.1',
    port: 0,
    static: {
      directory,
      cacheControl: 'public, max-age=60',
    },
  });

  try {
    await once(server, 'listening');
    await writeFile(join(directory, 'index.html'), 'index page');
    await writeFile(join(directory, 'style.css'), 'body {}');
    const port = server.address().port;

    const index = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await index.text(), 'index page');
    assert.equal(index.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(index.headers.get('cache-control'), 'public, max-age=60');

    const head = await fetch(`http://127.0.0.1:${port}/style.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');

    const missing = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missing.status, 404);
  } finally {
    const closed = once(server, 'close');
    server.close();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
}
