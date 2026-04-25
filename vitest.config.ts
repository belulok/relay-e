import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/dist/**",
        "**/node_modules/**",
        "packages/db/src/migrate.ts",
        "packages/queue/src/workers/main.ts",
      ],
    },
  },
});
