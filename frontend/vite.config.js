import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const buildProxyConfig = (target) => ({
  '/api': {
    target,
    changeOrigin: true,
    secure: false,
  },
});

const parseCsv = (value = '') =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, rootDir, '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4010';
  const allowedHosts = parseCsv(env.VITE_ALLOWED_HOSTS || env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS);

  const serverConfig = {
    host: true,
    port: 8100,
    strictPort: true,
    proxy: buildProxyConfig(proxyTarget),
    ...(allowedHosts.length ? { allowedHosts } : {}),
  };

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDir, 'index.html'),
          certificadoPdf: resolve(rootDir, 'certificado-pdf.html'),
        },
      },
    },
    server: serverConfig,
    preview: {
      host: true,
      proxy: buildProxyConfig(proxyTarget),
    },
  };
});
