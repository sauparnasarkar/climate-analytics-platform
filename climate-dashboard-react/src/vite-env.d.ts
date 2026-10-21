/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// The design system is aliased to source, so its own plotly.js-dist-min import resolves
// against its node_modules (no co-located @types there) — declare it ambiently.
declare module 'plotly.js-dist-min';
