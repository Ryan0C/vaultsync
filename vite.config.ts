import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "public/*", dest: "." },
        { src: "templates/**/*", dest: "templates" },
        { src: "templates/**/*", dest: "templates" },
      ]
    })
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { main: "src/main.ts" },
      output: { entryFileNames: "main.js", format: "es" }
    }
  }
});