const MIME_TYPES = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.zip': 'application/zip',
};

export function normalizeStaticOptions(value) {
  if (!value) return null;

  const options = typeof value === 'string'
    ? { directory: value }
    : { ...value };

  if (!options.directory) {
    throw new TypeError('static.directory is required');
  }

  return {
    directory: options.directory,
    index: options.index ?? 'index.html',
    spa: options.spa ?? false,
    fallthrough: options.fallthrough ?? true,
    cacheControl: options.cacheControl ?? null,
    dotfiles: options.dotfiles ?? false,
    first: options.first ?? false,
  };
}

export function safeAssetPath(pathname, options) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) return null;

  const segments = decoded.split('/').filter(Boolean);
  if (!options.dotfiles && segments.some((segment) => segment.startsWith('.'))) {
    return null;
  }

  if (segments.some((segment) => segment === '..')) return null;

  let relative = segments.join('/');
  if (!relative || decoded.endsWith('/')) {
    relative = relative ? `${relative}/${options.index}` : options.index;
  }

  return relative;
}

export function contentTypeFor(pathname) {
  const index = pathname.lastIndexOf('.');
  if (index === -1) return 'application/octet-stream';
  return MIME_TYPES[pathname.slice(index).toLowerCase()] ?? 'application/octet-stream';
}

export function isGetOrHead(request) {
  return request.method === 'GET' || request.method === 'HEAD';
}

export function staticHeaders(pathname, options, size, lastModified) {
  const headers = new Headers({
    'content-type': contentTypeFor(pathname),
    'content-length': String(size),
  });

  if (lastModified) headers.set('last-modified', lastModified.toUTCString());
  if (options.cacheControl) headers.set('cache-control', options.cacheControl);
  return headers;
}
