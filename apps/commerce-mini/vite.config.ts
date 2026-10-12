import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
process.env.UNI_H5_BASE = process.env.BASE_PATH || '/shop/'
export default defineConfig({ base: process.env.UNI_H5_BASE, plugins: [uni()], server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { '/api/v1': 'http://127.0.0.1:4016' } } })
