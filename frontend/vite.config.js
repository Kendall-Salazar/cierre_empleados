import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    // En desarrollo, redirige /api al backend corriendo en :8000
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
