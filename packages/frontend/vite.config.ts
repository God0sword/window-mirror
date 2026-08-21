import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import wasm from 'vite-plugin-wasm'
import path from 'path'

export default defineConfig({
  plugins: [
    wasm(),
    solid(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@kernel': path.resolve(__dirname, './src/kernel'),
      '@components': path.resolve(__dirname, './src/components'),
      '@stores': path.resolve(__dirname, './src/stores'),
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    include: [
      'monaco-editor',
      '@monaco-editor/react',
      '@tanstack/solid-devtools',
      '@tanstack/devtools-event-client',
    ],
  },
  build: {
    target: 'es2023',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('monaco-editor')) return 'monaco'
          if (id.includes('@tanstack')) return 'tanstack'
          return undefined
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    hmr: {
      port: 1421,
    },
  },
})
