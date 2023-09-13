/** @type {import('tailwindcss').Config} */
import wobbui from "wobbui/plugin";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}" /* src folder, for example */,
    "node_modules/wobbui/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [wobbui, require("tailwindcss-animate")],
};
