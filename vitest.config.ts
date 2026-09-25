import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.ts"],
      reporter: ["text", "lcov"],
      // Baseline recorded 2026-09-25 (before route tests):
      //   statements: 8.44%, branches: 7.58%, functions: 6.78%, lines: 8.95%
    },
  },
});
