"use client";

/**
 * DemoProTextarea — ProTextarea with demo-friendly defaults for context-menu
 * harness panels (voice, cleanup menu, auto-grow, iOS-safe 16px, bound agents).
 */

import { forwardRef } from "react";
import {
  ProTextarea,
  type ProTextareaProps,
} from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

export interface DemoProTextareaProps extends ProTextareaProps {
  minHeightClass?: string;
  /** Use monospace stack (code editor demos). */
  mono?: boolean;
}

export const DemoProTextarea = forwardRef<
  HTMLTextAreaElement,
  DemoProTextareaProps
>(function DemoProTextarea(
  {
    className,
    minHeightClass,
    mono = false,
    autoGrow = true,
    minHeight = 180,
    maxHeight = 420,
    enableCleanup = true,
    enableBoundAgents = true,
    ...props
  },
  ref,
) {
  return (
    <ProTextarea
      ref={ref}
      autoGrow={autoGrow}
      minHeight={minHeight}
      maxHeight={maxHeight}
      enableCleanup={enableCleanup}
      enableBoundAgents={enableBoundAgents}
      className={cn(
        "text-base w-full",
        mono && "font-mono",
        minHeightClass,
        className,
      )}
      {...props}
    />
  );
});
