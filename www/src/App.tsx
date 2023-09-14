import { ScrollArea, Toaster } from "wobbui";

import { useState } from "react";

import components, { ComponentType } from "./mappings";
import ComponentPreview from "./ComponentPreview";
import Installation from "./Installation";

function App() {
  const [selected, setSelected] = useState<ComponentType | null>(null);
  return (
    <div className="flex w-screen h-screen">
      <Toaster />
      <div className="flex flex-col py-4 text-md divide-y flex-shrink-0 border-r border-solid">
        <div className="flex font-bold py-4 px-8 text-xl">wobbui</div>
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            setSelected(null);
          }}
        >
          <div className="flex py-4 px-8 text-lg">Setup</div>
        </a>
        <ScrollArea>
          <div className="flex flex-col">
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
      </div>
      <div className="flex flex-grow flex-col p-8 max-w-[800px] min-w-[1px]">
        {selected ? <ComponentPreview selected={selected} /> : <Installation />}
      </div>
    </div>
  );
}

export default App;
