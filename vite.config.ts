import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['test.devl0rd.com'],
    proxy: {
      '/ws': { target: 'ws://localhost:5174', ws: true },
      '/health': 'http://localhost:5174',
    },
  },
});
