import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/

export default defineConfig({
  test: {
    environment: 'jsdom',                 // em vez de --environment jsdom
    setupFiles: ['./src/setupTests.ts'],  // em vez de --setupFiles ...
    globals: true,                        // útil para RTL/jest-dom
    css: true,                            // ignora imports de CSS/Tailwind nos testes
  },
  plugins: [
    react(),tailwindcss()
  ],  optimizeDeps: {
  include: ['xlsx'],
},server: {
  host: 'localhost', strictPort: true, port: 5173,
    proxy: {
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  
})
