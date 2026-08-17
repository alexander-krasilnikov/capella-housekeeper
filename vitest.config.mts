import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which Next's own
    // bundler resolves at build time but Vitest/Vite doesn't know about.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      // Reported, never enforced as a threshold - see the automated-quality-gate
      // spec's "Coverage does not gate the run".
      reporter: ["text", "lcov"],
      include: ["src/**", "app/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        // Test-only support code and fixtures aren't the subject of measurement.
        "src/test/**",
        "**/__fixtures__/**",
        "**/*.d.ts",
        // Type-only module - no statements to cover.
        "src/types.ts",
      ],
    },
  },
});
