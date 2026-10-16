import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/k-binge/';

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/180.png'],
      manifest: {
        name: 'K-Binge',
        short_name: 'K-Binge',
        description: 'Track the K-dramas you watch.',
        display: 'standalone',
        background_color: '#0F0D14',
        theme_color: '#0F0D14',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/show/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kbinge-shows',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://cdn.jsdelivr.net' || url.origin === 'https://www.themoviedb.org',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts-cdn', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 120, maxAgeSeconds: 365 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
} as any);
