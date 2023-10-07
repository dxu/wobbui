import { defineConfig } from "tsup";

export default defineConfig({
  entryPoints: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  dts: true,
  external: ["react", "rxjs", "react-hook-form", "zod", "@hookform/resolvers"],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client"',
    };
  },
  globalName: "wobbui",
});
