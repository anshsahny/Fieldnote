import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev server is pinned to http://localhost:5173: the App Check debug token is only
// applied on localhost (see src/lib/appCheckDebug.ts).
export default defineConfig({
  plugins: [react()],
  // fs.allow '..': the app imports shared/prompts/*.md, content/samples/*, and
  // remoteconfig.template.json from the repo root (single source for both platforms).
  server: { host: 'localhost', port: 5173, strictPort: true, fs: { allow: ['..'] } },
  preview: { host: 'localhost', port: 4173, strictPort: true },
  build: {
    sourcemap: false,
    // firebase-core (Firestore + Auth + App Check) is one vendor chunk by design, cached across deploys.
    chunkSizeWarningLimit: 700,
    // Vendor code the shell needs on every page gets its own long-cached chunks (app code changes
    // on every deploy; React and the Firebase core don't). Lazy features (AI, PDF) stay with their pages.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            {
              name: 'firebase-core',
              test: /node_modules[\\/](@firebase[\\/](app|auth|firestore|app-check|util|component|logger|webchannel-wrapper)|firebase)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
