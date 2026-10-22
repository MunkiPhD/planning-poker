import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = process.env.PORT ?? "3000";

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: { outDir: "../../dist/client", emptyOutDir: true },
  server: {
    proxy: { "/ws": { target: `ws://localhost:${port}`, ws: true } },
  },
  test: { root: ".", include: ["src/**/*.test.ts"] },
});
