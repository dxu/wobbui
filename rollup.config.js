const path = require("path");
const fs = require("fs");
const alias = require("@rollup/plugin-alias");
const postcss = require("rollup-plugin-postcss");
const autoprefixer = require("autoprefixer");

const { visualizer } = require("rollup-plugin-visualizer");
const babel = require("@rollup/plugin-babel");
const resolve = require("@rollup/plugin-node-resolve");
const typescript = require("@rollup/plugin-typescript");

const createBabelConfig = require("./babel.config");

const EXTENSION = /(\.(umd|cjs|es|m))?\.([cm]?[tj]sx?)$/;

const { root } = path.parse(process.cwd());
const external = (id) =>
  !id.startsWith(".") && !id.startsWith(root) && !id.startsWith("@/");
const extensions = [".js", ".ts", ".tsx"];
const getBabelOptions = (targets) => ({
  babelHelpers: "bundled",
  ...createBabelConfig({ env: (env) => env === "build" }, targets),
  extensions,
});

function createDeclarationConfig(input, output) {
  return {
    input,
    output: {
      dir: output,
    },
    external,
    plugins: [
      postcss({
        plugins: [autoprefixer()],
        autoModules: true,
        modules: true,
        extract: "styles.css",
        minimize: false,
        sourceMap: true,
      }),
      alias({
        entries: [
          {
            find: /^@\/(.*)/,
            replacement: path.resolve(__dirname, "src/$1"),
          },
        ],
      }),
      typescript({
        declaration: true,
        emitDeclarationOnly: true,
        outDir: output,
        declarationDir: output,
      }),
    ],
  };
}

function createESMConfig(input, output) {
  return {
    input,
    output: { file: output, format: "esm" },
    external,
    plugins: [
      postcss({
        plugins: [autoprefixer()],
        autoModules: true,
        modules: true,
        extract: "styles.css",
        minimize: false,
        sourceMap: true,
      }),

      alias({
        entries: [
          {
            find: /^@\/(.*)/,
            replacement: path.resolve(__dirname, "src/$1"),
          },
        ],
      }),
      babel(getBabelOptions({ node: 8 })),
      // sizeSnapshot(),
      resolve({ extensions }),
      visualizer(),
    ],
  };
}

function createCommonJSConfig(input, output) {
  return {
    input,
    output: { file: output, format: "cjs", exports: "named" },
    external,
    plugins: [
      postcss({
        plugins: [autoprefixer()],
        autoModules: true,
        modules: true,
        extract: "styles.css",
        minimize: false,
        sourceMap: true,
      }),

      alias({
        entries: [
          {
            find: /^@\/(.*)/,
            replacement: path.resolve(__dirname, "src/$1"),
          },
        ],
      }),
      babel(getBabelOptions({ ie: 11 })),
      // sizeSnapshot(),
      resolve({ extensions }),
    ],
  };
}

function createIIFEConfig(input, output, globalName) {
  return {
    input,
    output: {
      file: output,
      format: "iife",
      exports: "named",
      name: globalName,
      globals: {
        react: "React",
        rxjs: "rxjs",
      },
    },
    external,
    plugins: [
      postcss({
        plugins: [autoprefixer()],
        autoModules: true,
        modules: true,
        extract: "styles.css",
        minimize: false,
        sourceMap: true,
      }),
      alias({
        entries: [
          {
            find: /^@\/(.*)/,
            replacement: path.resolve(__dirname, "src/$1"),
          },
        ],
      }),
      babel(getBabelOptions({ ie: 11 })),
      // sizeSnapshot(),
      resolve({ extensions }),
    ],
  };
}

// // Helper function to convert dash-case to camelCase
// function dashToCamelCase(str) {
//     return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
// }

// // List all files in the src/components directory
// const componentFiles = fs.readdirSync('src/')
//   .filter(file =>
//     ['.ts', '.tsx'].includes(path.extname(file)) && !file.startsWith('_')
//   )
//   .map(file => path.join('src/', file));

// console.log('componentfiles', componentFiles)
// // Generate configurations for each component file
// const configs = componentFiles.flatMap(file => {
//   const baseName = path.basename(file, path.extname(file));
//   const camelCaseName = dashToCamelCase(baseName);
//   return [
//     createDeclarationConfig(file, 'dist'),
//     // createESMConfig(file, path.join("dist", `${camelCaseName}.js`)),
//     // createCommonJSConfig(file, path.join("dist", `${camelCaseName}.cjs.js`)),
//     // createIIFEConfig(file, path.join("dist", `${camelCaseName}.iife.js`), camelCaseName),
//   ];
// });

// console.log(configs)
module.exports = [
  createDeclarationConfig("src/index.ts", "dist"),
  createESMConfig("src/index.ts", "dist/index.js"),
  createCommonJSConfig("src/index.ts", "dist/index.cjs.js"),
  createIIFEConfig("src/index.ts", "dist/index.iife.js", "wobui"),
];
