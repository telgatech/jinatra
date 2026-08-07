import { serve } from 'jinatra/node';
import app from './example.js';

serve(app, {
  port: 3000,
  static: {
    directory: './public',
    cacheControl: 'public, max-age=60',
  },
});

console.log('Jinatra running at http://localhost:3000');
