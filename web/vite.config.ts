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
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
