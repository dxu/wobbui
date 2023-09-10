"use client";

import {
  Toast,
  ToastAction,
  type ToastActionElement,
  ToastClose,
  ToastDescription,
  type ToastProps,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/utils/_toast";

import { toast, useToast } from "@/utils/_use-toast";

function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

export {
  Toast,
  toast,
  ToastAction,
  type ToastActionElement,
  ToastClose,
  ToastDescription,
  Toaster,
  type ToastProps,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToast,
};
