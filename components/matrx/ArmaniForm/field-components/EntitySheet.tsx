"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Enhanced variant definitions
const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      position: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        center:
          "inset-0 m-auto border rounded-lg data-[state=closed]:fade-out data-[state=open]:fade-in",
      },
      size: {
        sm: "",
        md: "",
        default: "",
        lg: "",
        xl: "",
        full: "",
      },
    },
    compoundVariants: [
      // Side sheets (left/right)
      { position: ["left", "right"], size: "sm", class: "w-3/4 sm:max-w-sm" },
      { position: ["left", "right"], size: "md", class: "w-3/4 sm:max-w-md" },
      {
        position: ["left", "right"],
        size: "default",
        class: "w-3/4 sm:max-w-md",
      },
      { position: ["left", "right"], size: "lg", class: "w-3/4 sm:max-w-lg" },
      { position: ["left", "right"], size: "xl", class: "w-3/4 sm:max-w-xl" },
      { position: ["left", "right"], size: "full", class: "w-screen" },
      // Top/Bottom sheets
      { position: ["top", "bottom"], size: "sm", class: "max-h-[35dvh]" },
      { position: ["top", "bottom"], size: "md", class: "max-h-[50dvh]" },
      { position: ["top", "bottom"], size: "default", class: "max-h-[50dvh]" },
      { position: ["top", "bottom"], size: "lg", class: "max-h-[65dvh]" },
      { position: ["top", "bottom"], size: "xl", class: "max-h-[75dvh]" },
      { position: ["top", "bottom"], size: "full", class: "max-h-dvh" },
      // Center sheets
      { position: "center", size: "sm", class: "max-w-sm max-h-[90dvh]" },
      { position: "center", size: "md", class: "max-w-md max-h-[90dvh]" },
      { position: "center", size: "default", class: "max-w-md max-h-[90dvh]" },
      { position: "center", size: "lg", class: "max-w-lg max-h-[90dvh]" },
      { position: "center", size: "xl", class: "max-w-xl max-h-[90dvh]" },
      { position: "center", size: "full", class: "max-w-[95vw] max-h-[95dvh]" },
    ],
    defaultVariants: {
      position: "right",
      size: "md",
    },
  },
);

// Enhanced props interface
interface EntitySheetProps extends SheetPrimitive.DialogProps {
  position?: VariantProps<typeof sheetVariants>["position"];
  size?: VariantProps<typeof sheetVariants>["size"];
  showClose?: boolean;
  trigger?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function EntitySheet({
  position = "right",
  size = "md",
  showClose = true,
  trigger,
  title,
  description,
  footer,
  className,
  children,
  ...props
}: EntitySheetProps) {
  return (
    <SheetPrimitive.Root {...props}>
      {trigger && (
        <SheetPrimitive.Trigger asChild>{trigger}</SheetPrimitive.Trigger>
      )}
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(sheetVariants({ position, size }), className)}
        >
          {showClose && (
            <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
              <Cross2Icon className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}

          {!title && (
            <SheetPrimitive.Title className="sr-only">
              Panel
            </SheetPrimitive.Title>
          )}
          {!description && (
            <SheetPrimitive.Description className="sr-only">
              {typeof title === "string" && title.trim().length > 0
                ? title
                : "Side panel content"}
            </SheetPrimitive.Description>
          )}

          {(title || description) && (
            <div className="mb-4">
              {title && (
                <SheetPrimitive.Title className="text-lg font-semibold">
                  {title}
                </SheetPrimitive.Title>
              )}
              {description && (
                <SheetPrimitive.Description className="text-sm text-muted-foreground">
                  {description}
                </SheetPrimitive.Description>
              )}
            </div>
          )}

          <div className="relative flex-1 overflow-y-auto">{children}</div>

          {footer && (
            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              {footer}
            </div>
          )}
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

export default EntitySheet;
