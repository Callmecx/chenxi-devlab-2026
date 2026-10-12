import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "apps/**/src/**/*.test.ts",
      "apps/commerce-mini/tests/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
    environment: "node",
  },
});
