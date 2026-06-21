import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    entry: 'src/main/index.ts',
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    entry: 'src/preload/index.ts',
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    entry: 'src/renderer/index.html',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
