import { Jinatra } from '@telga/jinatra';
import { serve } from '@telga/jinatra/bun';
import { createEjsRenderer } from '@telga/jinatra/ejs';

const app = new Jinatra();

app.get('/', (c) => c.render('home', {
  title: 'Jinatra EJS example',
  heading: 'Hello from EJS',
  products: [
    { name: 'Keyboard', price: 2999 },
    { name: 'Mouse', price: 1499 },
  ],
}));

serve(app, {
  port: 3000,
  static: './public',
  views: createEjsRenderer({
    directory: './views',
    layout: 'layout',
  }),
});
