import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const synDs = path.resolve(dirname, process.env.SYN_DS_PATH ?? '../../syena-design-system');

// Separate from vite.config.ts (which carries PWA/base-path/proxy config that's
// irrelevant to unit tests) — mirrors the same alias for the design system so page
// components resolve it the same way they do in the real app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@syena/ds/styles.css': path.join(synDs, 'src/styles.css'),
      '@syena/ds': path.join(synDs, 'src/index.ts'),
      // The icon set's default entry is CommonJS, which Node loads with the design system's own copy of React; its ES module build goes through the alias below.
      'lucide-react': path.join(synDs, 'node_modules/lucide-react/dist/esm/lucide-react.mjs'),
      react: path.resolve(dirname, 'node_modules/react'),
      'react-dom': path.resolve(dirname, 'node_modules/react-dom'),
    },
    // A plain alias isn't enough on its own: by default Vitest treats node_modules
    // packages as "external" and loads them via Node's own resolution (bypassing
    // Vite's aliasing), so ag-grid-react — imported from inside the design system's
    // *own* node_modules, since DataTable.tsx lives in that source tree — picks up
    // its nested React copy directly, not the alias above. dedupe forces
    // Vite's resolver to collapse any resolved 'react'/'react-dom' to one instance
    // regardless of which node_modules it was found under.
    dedupe: ['react', 'react-dom', 'ag-grid-community', 'ag-grid-react'],
  },
  // The design system sits outside this project's root; its globe imports a bundled TopoJSON via
  // `?url`, which Vite refuses to load ("Denied ID") unless the directory is in fs.allow.
  server: { fs: { allow: [path.resolve(dirname, '..'), synDs] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Force these through Vite's transform pipeline (where the alias/dedupe above
    // apply) instead of Vitest's default "load node_modules via plain Node resolution"
    // path — without this, dedupe/alias never even get a chance to run for them.
    server: {
      deps: {
        inline: [/ag-grid/, /syena-design-system/, /lucide-react/],
      },
    },
  },
});
