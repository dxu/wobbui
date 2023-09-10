import { ScrollArea } from "wobbui";

import { useState } from "react";

import components from "./mappings";

type ComponentType = keyof typeof components;

function App() {
  const [selected, setSelected] = useState<ComponentType>("Accordion");
  return (
    <div className="flex w-screen h-screen">
      <ScrollArea>
        <div className="flex flex-col  px-4 py-4 text-lg divide-y">
          {Object.entries(components).map(([key]) => {
            return (
              <a
                className="py-2 px-4 hover:bg-black"
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
      <div className="flex-grow">{components[selected].component}</div>
    </div>
  );
}

export default App;
