import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: {
        // Expose only the invitation exchange to the example frontend.
        '^/api/join$': { target: env.BACKEND_URL || 'http://127.0.0.1:3000', changeOrigin: true },
        '^/api/invitations$': { target: env.BACKEND_URL || 'http://127.0.0.1:3000', changeOrigin: true },
      },
    },
  };
});
