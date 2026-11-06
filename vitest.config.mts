import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_URL: "file:./test.db", GOODDEEDS_MODE: "mock" },
    globalSetup: ["tests/setup-db.ts"],
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
