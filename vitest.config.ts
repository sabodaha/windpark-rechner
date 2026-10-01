import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // The report is rendered to HTML in a test (test/report-render.test.ts); Next's tsconfig keeps JSX as is.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
