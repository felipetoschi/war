import { defineConfig } from "vitest/config";

// No GitHub Pages o site fica em https://<usuario>.github.io/<repo>/,
// então o caminho base vem da variável BASE_PATH definida no workflow de deploy.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
