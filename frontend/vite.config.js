import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: { outDir: 'dist' },
  // This proxy runs only during local development, never on Render Static Site.
  server: { proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000' } },
});
