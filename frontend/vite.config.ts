import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('maplibre-gl')) return 'maplibre';
            if (id.includes('recharts')) return 'charts';
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('micromark') || id.includes('mdast') || id.includes('unist')) return 'markdown';
            if (id.includes('@radix-ui')) return 'radix';
            if (id.includes('@heroicons') || id.includes('lucide-react')) return 'icons';
            return 'vendor';
          }
        }
      },
    },
  },
})
