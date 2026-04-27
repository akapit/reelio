import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/lib/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
