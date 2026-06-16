"use client";

import * as React from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const sheetVariants = cva("", {
  variants: {
    position: {
      top: "",
      bottom: "",
      left: "",
      right: "",
      center: "",
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
  defaultVariants: {
    position: "right",
    size: "md",
  },
});

function sizeToPanelPercent(
  size: VariantProps<typeof sheetVariants>["size"],
): number {
  switch (size) {
    case "sm":
      return 28;
    case "lg":
      return 38;
    case "xl":
      return 42;
    case "full":
      return 88;
    case "md":
    case "default":
    default:
      return 32;
  }
}

interface EntitySheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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

export function EntitySheetTwo({
  position = "right",
  size = "md",
  trigger,
  title,
  description,
  footer,
  className,
  children,
  open: openProp,
  onOpenChange,
}: EntitySheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const panelPosition =
    position === "center" || position === "top" || position === "bottom"
      ? position === "top"
        ? "top"
        : position === "bottom"
          ? "bottom"
          : "right"
      : position;

  return (
    <>
      {trigger && (
        <span
          role="presentation"
          className="contents"
          onClick={() => setOpen(true)}
        >
          {trigger}
        </span>
      )}
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={setOpen}
        title={title ?? "Details"}
        description={description}
        position={panelPosition}
        defaultSize={sizeToPanelPercent(size)}
        className={cn(sheetVariants({ position, size }), className)}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        <div className="flex h-full flex-col px-3 pb-4">
          <ScrollArea className="flex-1 scrollbar-none">
            <div className="h-full">{children}</div>
          </ScrollArea>

          {footer && (
            <div className="mt-4 flex-none flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              {footer}
            </div>
          )}
        </div>
      </MatrxDynamicPanelHost>
    </>
  );
}

export default EntitySheetTwo;
