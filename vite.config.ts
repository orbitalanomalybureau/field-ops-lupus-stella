import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Nitro stays gated to `build` (the Vercel deploy target): enabled in dev it
// opens a second dev-server port.
//
// FIELDOPS_NO_NITRO drops the preset so the build emits dist/client +
// dist/server, which is the only layout `vite preview` can serve. The Vercel
// output is a single serverless function with no static HTML, so without this
// the Playwright suite would have nothing to point at but the dev server —
// and testing the dev bundle cannot catch build-only breakage.
export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  build: {
    // The 3D world is one deliberate lazy chunk; the 500 kB default warning is
    // noise. The real gate is scripts/check-bundle-budget.mjs, run in CI.
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" && !process.env.FIELDOPS_NO_NITRO
      ? [nitro({ preset: "vercel" })]
      : []),
    viteReact(),
  ],
}));
