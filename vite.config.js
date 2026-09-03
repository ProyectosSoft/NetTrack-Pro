import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// Only enable the PWA service worker in production builds. In dev, a registered
// worker can cache-serve stale /node_modules/.vite and /src chunks, which causes
// React hooks dispatcher mismatches ("Cannot read properties of null (reading
// 'useState')") when Vite re-optimizes deps.
const enablePWA = process.env.NODE_ENV === 'production'

// When building for GitHub Pages (project site) the app is served from a
// sub-path (/<repo>/), so assets/router need that base. It is derived from the
// repo automatically in CI (GITHUB_REPOSITORY), so moving the project to another
// GitHub repo/owner needs no code change. PAGES_BASE overrides it if needed;
// non-Pages builds (local dev, custom domain) stay at root "/".
function resolveBase() {
  if (process.env.GHPAGES !== "true") return "/";
  if (process.env.PAGES_BASE) return process.env.PAGES_BASE;
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return repo ? `/${repo}/` : "/nettrack-pro/";
}
const base = resolveBase();

// https://vite.dev/config/
export default defineConfig({
  base,
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    react(),
    enablePWA && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NetTrack Pro',
        short_name: 'NetTrack',
        description: 'Seguimiento de instalaciones de red por pisos, espacios y puntos.',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Precache the app shell; never cache API calls (always hit the network).
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the stable React runtime into its own chunk so it stays cached
        // across app deploys (app code changes don't invalidate it). jspdf and
        // html2canvas are left alone so they keep their on-demand dynamic chunks.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});