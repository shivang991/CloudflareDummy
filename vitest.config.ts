import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./frontend", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"] },
});
