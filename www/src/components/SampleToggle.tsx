import { Bold } from "lucide-react";

import { Toggle } from "wobbui";

export default function SampleToggle() {
  return (
    <Toggle aria-label="Toggle italic">
      <Bold className="h-4 w-4" />
    </Toggle>
  );
}
