// What the JSX compiler imports when `jsxImportSource` is "wobbui": the functions `<main>` compiles to, and the JSX
// types. Development builds import `wobbui/jsx-dev-runtime`, which package.json points here too.
export { Fragment, jsx, jsx as jsxs, jsx as jsxDEV, type JSX } from "./index.js";
