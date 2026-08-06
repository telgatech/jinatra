import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import ejs from 'ejs';

/**
 * Create an EJS renderer for self-hosted Jinatra applications.
 *
 * The returned function is suitable for the `views` option accepted by the
 * Bun and Node adapters. Templates are loaded from disk and compiled once.
 */
export function createEjsRenderer(options = {}) {
  const directory = resolve(options.directory ?? './views');
  const extension = normalizeExtension(options.extension ?? '.ejs');
  const defaultLayout = options.layout ?? null;
  const cacheEnabled = options.cache ?? process.env.NODE_ENV === 'production';
  const ejsOptions = { ...(options.ejs ?? {}) };
  const compiled = new Map();

  async function loadTemplate(name) {
    const pathname = resolveTemplatePath(directory, name, extension);

    if (cacheEnabled && compiled.has(pathname)) {
      return compiled.get(pathname);
    }

    const source = await readFile(pathname, 'utf8');
    const template = ejs.compile(source, {
      filename: pathname,
      async: false,
      ...ejsOptions,
    });

    if (cacheEnabled) compiled.set(pathname, template);
    return template;
  }

  async function render(name, data = {}, renderOptions = {}) {
    const template = await loadTemplate(name);
    const locals = {
      ...data,
      ...(renderOptions.locals ?? {}),
    };

    const body = template(locals);
    const layout = renderOptions.layout === false
      ? null
      : (renderOptions.layout ?? defaultLayout);

    if (!layout) return body;

    const layoutTemplate = await loadTemplate(layout);
    return layoutTemplate({
      ...locals,
      body,
    });
  }

  render.clearCache = () => compiled.clear();
  render.directory = directory;
  return render;
}

function resolveTemplatePath(root, name, extension) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('View name must be a non-empty string');
  }

  const cleanName = name.trim();
  if (cleanName.includes('\0')) throw new Error('Invalid view name');

  const filename = cleanName.endsWith(extension)
    ? cleanName
    : `${cleanName}${extension}`;

  const pathname = resolve(root, filename);
  if (pathname !== root && !pathname.startsWith(`${root}${sep}`)) {
    throw new Error(`View path escapes views directory: ${name}`);
  }

  return pathname;
}

function normalizeExtension(extension) {
  return extension.startsWith('.') ? extension : `.${extension}`;
}
