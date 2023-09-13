import { ScrollArea, Toaster } from "wobbui";

import { useState } from "react";

import components from "./mappings";

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
      <div className="flex flex-grow flex-col p-8 max-w-[800px]">
        <h1 className="text-2xl mb-4 font-bold">{selected}</h1>
        <div className="flex flex-col w-full items-center border border-dotted border-border p-8">
          {components[selected].component}
        </div>
      </div>
    </div>
  );
}

export default App;
