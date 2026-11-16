import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "wasm-module",
      enforce: "pre",
      load(id) {
        if (!id.endsWith(".wasm")) return null;
        const bytes = readFileSync(id).toString("base64");
        return `export default new WebAssembly.Module(Uint8Array.from(atob("${bytes}"), (c) => c.charCodeAt(0)));`;
      },
    },
  ],
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "scripts/**/*.test.ts", "src/lib/**/*.test.ts", "modules/cartoon-globe/vendor/**/*.test.ts"],
    env: {
      CONVEX_CLOUD_URL: "https://test.convex.cloud",
      CONVEX_SITE_URL: "https://test.convex.site",
    },
    server: { deps: { inline: ["convex-test", "password-hash-wasm"] } },
  },
});
