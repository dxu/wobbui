const esbuild = require("esbuild");
const path = require("path");
const postcss2 = require("esbuild-plugin-postcss2");
const autoprefixer = require("autoprefixer");

const alias = {
  "@": path.resolve(__dirname, "src/"),
};

const commonPlugins = [
  postcss2.default({
    plugins: [autoprefixer()],
  }),
];

esbuild
  .build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outdir: "dist",
    external: ["react", "rxjs"], // replace with your externals
    plugins: commonPlugins,
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    banner: {
      js: '"use client";',
    },
    sourcemap: true,
    minify: true,
    format: "esm", // for ES modules
    target: ["es2017"],
    alias,
  })
  .catch(() => process.exit(1));

// Repeat the esbuild.build() call for other formats like cjs, iife, etc.
