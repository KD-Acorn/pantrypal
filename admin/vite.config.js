import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3005 },
  preview: {
    port: 3005,
    allowedHosts: ['admin.mypantryclub.com'],
  },
});
