import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
    // Don't intercept requests that look like they're going to external domains
    middlewareMode: false,
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: (id) => {
        // Don't bundle transformers - let it load dynamically
        return id.includes('@xenova/transformers');
      },
    },
  },
});
