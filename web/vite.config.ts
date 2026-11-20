import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev server is pinned to http://localhost:5173: the App Check debug token is only
// applied on localhost (see src/lib/appCheckDebug.ts).
export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5173, strictPort: true },
  preview: { host: 'localhost', port: 4173, strictPort: true },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
