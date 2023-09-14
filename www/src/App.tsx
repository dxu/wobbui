import { Badge, ScrollArea, Toaster } from "wobbui";

import { useState } from "react";

import components from "./mappings";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ExternalLink } from "lucide-react";

type ComponentType = keyof typeof components;

function App() {
  const [selected, setSelected] = useState<ComponentType>("Accordion");
  return (
    <div className="flex w-screen h-screen">
      <Toaster />
      <ScrollArea className="flex-shrink-0 border-r border-solid">
        <div className="flex flex-col py-4 text-lg divide-y">
          {Object.entries(components).map(([key]) => {
            return (
              <a
                className="py-2 px-8 hover:bg-black"
                onClick={() => {
                  setSelected(key as ComponentType);
                }}
              >
                {key as ComponentType}
              </a>
            );
          })}
        </div>
      </ScrollArea>
      <div className="flex flex-grow flex-col p-8 max-w-[800px] min-w-[1px]">
        <div className="flex items-center mb-4 gap-4">
          <h1 className="text-2xl font-bold">{selected}</h1>
          <a
            target="_blank"
            href={`https://www.radix-ui.com/primitives/docs/components/${selected
              .split(" ")
              .join("-")
              .toLowerCase()}`}
          >
            <Badge className="gap-1">
              Radix API
              <ExternalLink size={12} />
            </Badge>
          </a>
        </div>
        <div className="flex flex-col w-full gap-4">
          <div className="flex flex-col w-full">
            <h2 className="text-xs uppercase mb-2 font-bold">Preview</h2>
            <div className="flex flex-col w-full items-center p-8  border border-dotted border-border">
              {components[selected].component}
            </div>
          </div>
          <div className="flex flex-col w-full">
            <h2 className="text-xs uppercase font-bold">Code</h2>
            <SyntaxHighlighter language="javascript" style={vscDarkPlus}>
              {components[selected].raw}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
