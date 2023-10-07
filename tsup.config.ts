import { defineConfig } from "tsup";
import autoprefixer from "autoprefixer";
import postcss2 from "esbuild-plugin-postcss2";

export default defineConfig({
  entryPoints: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  dts: true,
  external: ["react", "rxjs"],
  globalName: "wobui",
  esbuildPlugins: [
    postcss2.default({
      plugins: [autoprefixer()],
    }),
  ],
});
