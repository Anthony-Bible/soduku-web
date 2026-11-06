/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Sudoku',
        short_name: 'Sudoku',
        description: 'Sudoku with a Daily Puzzle, Streaks and Achievements. Works offline.',
        theme_color: '#4f46e5',
        background_color: '#4f46e5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        // The API and sign-in pages are the Worker's, never the app shell, and are never cached.
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // The Lettergrid Word List is not in the Sudoku critical path: it is fetched when Lettergrid
        // opens, then kept for offline. Each version has its own immutable file name.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/lettergrid\/wordlist-v\d+\.txt$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lettergrid-wordlists',
              // The Worker answers an unknown path with index.html and a 200 (single-page-application
              // fallback). Never keep that under a Word List URL, or the real file could never load.
              plugins: [
                {
                  cacheWillUpdate: async ({ response }: { response: Response }) =>
                    response.status === 200 && !(response.headers.get('content-type') ?? '').includes('text/html')
                      ? response
                      : null,
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  server: {
    // `pnpm dev` talks to `pnpm dev:worker` (wrangler dev) for /api and /auth.
    proxy: { '/api': 'http://localhost:8787', '/auth': 'http://localhost:8787' },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'worker/**/*.test.ts'],
  },
})
