import { Badge } from "wobbui";
import components, { ComponentType } from "./mappings";

type Props = { selected: ComponentType };

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ExternalLink } from "lucide-react";

export default function ComponentPreview({ selected }: Props) {
  return (
    <>
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
    </>
  );
}
