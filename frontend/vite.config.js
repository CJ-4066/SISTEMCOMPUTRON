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
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';
  const allowedHosts = parseCsv(env.VITE_ALLOWED_HOSTS || env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS);

  const serverConfig = {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: buildProxyConfig(proxyTarget),
    ...(allowedHosts.length ? { allowedHosts } : {}),
  };

  return {
    plugins: [react()],
    server: serverConfig,
    preview: {
      host: true,
      proxy: buildProxyConfig(proxyTarget),
    },
  };
});
