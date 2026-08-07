---
layout: home
hero:
  name: Jinatra
  text: Web apps without the framework ceremony.
  tagline: A tiny Fetch-native web framework with simple routing, request helpers, and built-in JSX SSR.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/u89012/jinatra
features:
  - icon: "⚡"
    title: Fetch-native
    details: Run the same app on Bun, Node, Cloudflare Workers, or any Fetch-compatible runtime.
  - icon: "✦"
    title: JSX included
    details: Server-render escaped JSX with no React, template engine, or hydration step.
  - icon: "◌"
    title: Small by design
    details: Routing, middleware, sessions, static files, and responses in a compact API.
---

<div class="home-intro">
  <div class="home-intro-grid">
    <div>
      <h2>Just write the handler.</h2>
      <p>Jinatra keeps the happy path close to the metal. Return a string, object, JSX tree, or native <code>Response</code> and Jinatra does the rest.</p>
      <p>No adapters to memorize. No application ceremony. Just a small router that feels good to use.</p>
    </div>
    <div class="home-code">
      <div class="home-code-bar"><span></span><span></span><span></span></div>
      <div class="home-code-body">
        <div class="home-code-line"><span class="keyword">import</span> { app, get, params } <span class="keyword">from</span> <span class="string">'jinatra'</span></div>
        <div class="home-code-line"><span class="keyword">import</span> { serve } <span class="keyword">from</span> <span class="string">'jinatra/bun'</span></div>
        <div class="home-code-line">&nbsp;</div>
        <div class="home-code-line"><span class="accent">get</span>(<span class="string">'/hello/:name'</span>, () =&gt; <span class="muted">'Hello ' + params.name</span>)</div>
        <div class="home-code-line">&nbsp;</div>
        <div class="home-code-line"><span class="accent">serve</span>(app, { port: <span class="string">3000</span> })</div>
      </div>
    </div>
  </div>
</div>

```js
import { app, get, params } from 'jinatra'
import { serve } from 'jinatra/bun'

get('/hello/:name', () => 'Hello ' + params.name)

serve(app, { port: 3000 })
```
