import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../shared', import.meta.url))
      ]
    }
  },
  preview: { host: 'localhost', port: 4174, strictPort: true }
})
