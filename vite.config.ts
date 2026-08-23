// `vitest/config` rather than `vite` — it is the same defineConfig widened to
// accept the `test` block below.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Not enabled in dev (the default) — `npm run dev` is this project's
      // real-device iteration loop (server.host below), and a dev-mode SW
      // would sit between every edit and the device under test.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tessera',
        short_name: 'Tessera',
        description: 'A photo jigsaw where progress is literally light.',
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The shell only. The 30-photo curated library (~25MB) and any
        // uploaded photo are cached on first play instead — via
        // runtimeCaching below — so a fresh install doesn't force a 25MB
        // download before the player has touched anything (§17, §14).
        // Audio has no asset files to precache: `src/audio` synthesises
        // every sound from Web Audio buffers at runtime (CLAUDE.md), so
        // it's already offline the moment the JS shell is.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // The libheif/HEIC decoder is a ~3MB WASM-backed chunk that Track 1
        // deliberately keeps out of the main bundle so only a HEIC upload
        // ever pays for it (see scripts/check-bundle-budget.mjs). Precaching
        // it here would force that 3MB onto every install regardless —
        // exactly what the code-split exists to avoid — and it also exceeds
        // Workbox's 2MB default precache limit, which fails the build.
        globIgnores: ['**/heic-to-*.js'],
        runtimeCaching: [
          {
            // Vite hashes and flattens the curated JPEGs straight into
            // /assets/ at build time — there is no /assets/curated/ path on
            // the built site, only in the source tree.
            urlPattern: /\/assets\/.*\.(?:jpg|jpeg|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'curated-photos',
              // The whole library plus slack, so a full 30/50-photo set
              // never evicts itself under LRU pressure from its own size.
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // No `crossorigin` on index.html's stylesheet link (only the
            // preconnects have it), so this fetch is opaque — status 0 — and
            // Workbox drops opaque responses by default unless told to keep
            // them. Missing this line is why the fonts CSS never cached and
            // failed offline outright: no font fallback shown, a hard fetch
            // error instead.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    // Real-hardware testing is a gate at every step, so the dev server must be
    // reachable from an iPad or iPhone on the same network.
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
