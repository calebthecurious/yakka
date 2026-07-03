import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic tests — no DOM needed.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
