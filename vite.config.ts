import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Electron loads index.html via file://, so paths must be relative
  server: {
    port: 5173,
    strictPort: true,
  },
})
