import app from './example.js';

// The expression is configured separately in wrangler.example.jsonc.
app.cron('0 * * * *', async (controller, env, ctx) => {
  console.log(`Jinatra cron fired: ${controller.cron}`);
  // Put scheduled work here, for example:
  // await env.DB.prepare('...').run();
});

// worker() returns { fetch, scheduled } when cron handlers are registered.
export default app.worker();

// For Worker-first routing with an ASSETS binding, use instead:
// import { withAssets } from 'jinatra/cloudflare';
// export default withAssets(app);
