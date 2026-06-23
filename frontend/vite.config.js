import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    port: 3004,
    allowedHosts: ['pantry.doneitmobile.com']
  }
})