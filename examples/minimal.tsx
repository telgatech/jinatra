import { app } from 'jinatra';
import { serve } from 'jinatra/bun';

const Layout = ({ children }) => (
  <html>
    <body>{children}</body>
  </html>
);

get('/', () => (
  <Layout>
    <h1>Jinatra</h1>
  </Layout>
));

get('/hello/:name', () => <h1>Hello {params.name}</h1>);

post('/echo', async () => ({ body: await json() }));

serve(app, { port: 3000 });
