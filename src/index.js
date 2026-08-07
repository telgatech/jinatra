import { Jinatra, App, Context } from './app.js';
import {
  body, cookies, env, form, headers, params, query, request, status, waitUntil,
} from './request-context.js';
import {
  HTTPError, html, httpError, json, normalizeResponse, raw, redirect, text,
} from './response.js';
import { Fragment, jsx, jsxs, render } from './jsx/render.js';

export {
  Jinatra, App, Context,
  body, cookies, env, form, headers, params, query, request, status, waitUntil,
  HTTPError, html, httpError, json, normalizeResponse, raw, redirect, text,
  Fragment, jsx, jsxs, render,
};

// The default app makes the terse route API possible. Importing the
// package as `import "jinatra"` registers these names for a Bun entrypoint.
export const app = new Jinatra();
export const get = app.get.bind(app);
export const post = app.post.bind(app);
export const put = app.put.bind(app);
export const patch = app.patch.bind(app);
export const del = app.delete.bind(app);
export const remove = del;
export const any = app.any.bind(app);
export const all = any;
export const use = app.use.bind(app);
export const before = app.before.bind(app);
export const after = app.after.bind(app);
export const notFound = app.notFound.bind(app);
export const onError = app.onError.bind(app);
export const staticFiles = app.static.bind(app);
export const worker = () => app.worker();

if (typeof globalThis === 'object') {
  const globals = {
    get, post, put, patch, delete: del, del, any, all, use, before, after,
    notFound, onError, static: staticFiles,
    params, query, body, form, headers, cookies, request, status,
    json, html, text, redirect, raw, render,
  };
  for (const [name, value] of Object.entries(globals)) {
    if (!(name in globalThis)) globalThis[name] = value;
  }
}

export { staticFiles as static, del as delete };

export default app;
