import app from './example.js';

// Cloudflare can export the Web Standards app directly.
export default app;

// For Worker-first routing with an ASSETS binding, use instead:
// import { withAssets } from '@telga/jinatra/cloudflare';
// export default withAssets(app);
