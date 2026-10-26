import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the page runs on http://localhost:5173 and sends every /api call to the Flask server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:5050' },
  },
})
