import { serve } from '@telga/jinatra/bun';
import app from './example.js';

const server = serve(app, {
  port: 3000,
  static: {
    directory: './public',
    cacheControl: 'public, max-age=60',
  },
});

console.log(`Jinatra running at ${server.url}`);
