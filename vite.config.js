import { defineConfig } from 'vite';

// One copy of three, always. Without this, dev dep-optimization can discover
// an addon import mid-session (it happened when GLTFExporter landed) and
// serve it with a second three instance — "WARNING: Multiple instances of
// Three.js being imported." dedupe pins resolution to a single copy;
// optimizeDeps.include pre-bundles every three entry at server startup so
// none is ever optimized mid-session against a stale cache.
export default defineConfig({
  resolve: { dedupe: ['three'] },
  optimizeDeps: {
    include: [
      'three',
      'three/addons/controls/OrbitControls.js',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/exporters/STLExporter.js',
      'three/addons/exporters/GLTFExporter.js',
    ],
  },
});
