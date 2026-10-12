import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: process.env.BASE_PATH || '/pulse/',
  build: { target: 'es2022', sourcemap: false },
  server: { proxy: { '/api/v1': 'http://127.0.0.1:4016' } },
});
