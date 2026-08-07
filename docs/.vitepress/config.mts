import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Jinatra',
  description: 'A tiny Fetch-native web framework with simple routing and built-in JSX SSR.',
  base: process.env.DOCS_BASE ?? '/jinatra/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#0b0d12' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Jinatra — web apps without the framework ceremony' }],
  ],
  themeConfig: {
    siteTitle: 'jinatra',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Examples', link: '/examples' },
      { text: 'GitHub', link: 'https://github.com/telgatech/jinatra' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start here',
          items: [
            { text: 'Why Jinatra?', link: '/guide/why-jinatra' },
            { text: 'Getting started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Build an app',
          items: [
            { text: 'Routing', link: '/guide/routing' },
            { text: 'Request context', link: '/guide/request-context' },
            { text: 'Responses', link: '/guide/responses' },
            { text: 'Middleware & errors', link: '/guide/middleware' },
            { text: 'Sessions', link: '/guide/sessions' },
            { text: 'JSX SSR', link: '/guide/jsx' },
          ],
        },
        {
          text: 'Deploy',
          items: [
            { text: 'Runtime adapters', link: '/guide/adapters' },
            { text: 'Cloudflare Workers', link: '/guide/cloudflare' },
          ],
        },
      ],
    },
    outline: 'deep',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/telgatech/jinatra' },
    ],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/telgatech/jinatra/edit/main/docs/:path',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Jinatra contributors',
    },
  },
})
