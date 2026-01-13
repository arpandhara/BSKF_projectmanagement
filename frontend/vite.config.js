import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// [https://vite.dev/config/](https://vite.dev/config/)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // This allows you to use "/api" in your frontend and it redirects to localhost:5000
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})