import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirror the tsconfig "@/*" → src/* path alias so tests resolve app imports.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Pure logic tests — no DOM needed.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
