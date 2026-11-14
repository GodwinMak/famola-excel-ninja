import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'disable-vite-hmr-ws',
      enforce: 'post',
      transform(code, id) {
        if (id.includes('vite/dist/client/client.mjs')) {
          return code.replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */'
          );
        }
      },
    },
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
  },
});
