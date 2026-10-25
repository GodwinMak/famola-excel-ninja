import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vite does NOT auto-populate process.env from .env files for the config
  // file itself (only for client code via import.meta.env) — without this,
  // process.env.VITE_API_BASE_URL is always undefined here even with a real
  // frontend/.env present, silently falling back to localhost:5000 and
  // proxying every /api call nowhere (Vite's proxy returns a 500 when it
  // can't reach its target), regardless of what .env actually says.
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_API_BASE_URL || 'http://localhost:5000';

  return {
    // The frontend is served from its own domain root, not a subpath, and
    // the backend lives on a separate origin (VITE_API_BASE_URL, baked into
    // API_BASE in utils/authToken.ts) — so no subpath base is needed here.
    base: '/',

    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },

    preview: {
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  };
});