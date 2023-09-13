"use client";

import { Button, toast as externalToast, ToastAction, useToast } from "wobbui";

export default function ToastDemo() {
  const { toast } = useToast();

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => {
          toast({
            title: "Scheduled: Catch up ",
            description: "Friday, February 10, 2023 at 5:57 PM",
            action: (
              <ToastAction altText="Goto schedule to undo">Undo</ToastAction>
            ),
          });
        }}
      >
        Add to calendar
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          externalToast({
            title: "Outside react",
            description: "Friday, February 10, 2023 at 5:57 PM",
            action: (
              <ToastAction altText="Goto schedule to undo">Undo</ToastAction>
            ),
          });
        }}
      >
        Add to calendar outside React
      </Button>
    </div>
  );
}
