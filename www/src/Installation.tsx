import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function Installation() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl">Setup</h1>
        <p>
          <b>wobbui</b> is a collection of React components based off of{" "}
          <a href="https://github.com/shadcn-ui/ui">shadcn/ui</a> exported as an
          npm package.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-bold text-xl">1. Install Dependencies</h2>
        <p>Install Tailwind:</p>

        <SyntaxHighlighter language="bash" style={vscDarkPlus}>
          {`npm i -D autoprefixer postcss tailwindcss tailwindcss-animate \nnpx tailwindcss init -p`}
        </SyntaxHighlighter>

        <p>Point Tailwind CSS to files containing tailwind classes:</p>

        <SyntaxHighlighter language="javascript" style={vscDarkPlus}>
          {`module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}" /* src folder, for example */],
  theme: {
    extend: {},
  },
  plugins: [],
};
`}
        </SyntaxHighlighter>

        <p>Add TailwindCSS to a CSS file:</p>

        <SyntaxHighlighter language="css" style={vscDarkPlus}>
          {`@tailwind base;
@tailwind components;
@tailwind utilities;
`}
        </SyntaxHighlighter>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-bold text-xl">2. Setup wobbui</h2>

        <p>Install wobbui:</p>
        <SyntaxHighlighter language="bash" style={vscDarkPlus}>
          pnpm i wobbui
        </SyntaxHighlighter>
        <p>
          Add the wobbui plugin to{" "}
          <code className="text-sm">tailwind.config.js</code>, and include all
          content from wobbui
        </p>

        <SyntaxHighlighter language="css" style={vscDarkPlus}>
          {`import wobbui from "wobbui/plugin";

export default {
  content: [
    ...,
    'node_modules/wobbui/**/*.{js,jsx,ts,tsx}'
  ],
  plugins: [
    ...,
    require('wobbui/plugin'),
    // required for animations
    require('tailwindcss-animate')
  ],
  ...
}`}
        </SyntaxHighlighter>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-bold text-xl">3. Customization</h2>
        <p>
          In your global css file, make sure to include these CSS variables used
          by `wobbui`. These can be customized or extended to fit your design
          system:
        </p>

        <SyntaxHighlighter language="css" style={vscDarkPlus}>
          {`
:root {
  --background-color: #fff;
  --text-color: #111;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;

  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;

  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;

  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;

  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;

  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;

  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;

  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;

  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;

  --radius: 0.5rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;

  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;

  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;

  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;

  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;

  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;

  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;

  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: hsl(212.7, 26.8%, 83.9);
}`}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
