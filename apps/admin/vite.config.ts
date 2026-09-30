import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In production Caddy serves this app and proxies /v1 to the API on the same host, so the admin
// and API share an origin (no CORS). The dev server does the same with a proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/v1': 'http://localhost:3101' },
  },
});
