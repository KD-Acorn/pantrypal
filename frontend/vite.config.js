import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

// Replaces __APP_VERSION__ in the copied sw.js with the real version from package.json.
// This means bumping package.json version automatically busts the service worker cache.
function swVersionPlugin() {
  return {
    name: 'sw-version',
    closeBundle() {
      const swPath = resolve('dist/sw.js')
      try {
        const sw = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, sw.replace('__APP_VERSION__', version))
      } catch { /* sw.js not in dist — skip */ }
    },
  }
}

export default defineConfig({
  plugins: [react(), swVersionPlugin()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  preview: {
    port: 3004,
    allowedHosts: [
      'pantry.doneitmobile.com',
      'mypantryclub.com',
      'www.mypantryclub.com',
      'mypantryclub.app',
      'www.mypantryclub.app'
    ]
  }
})