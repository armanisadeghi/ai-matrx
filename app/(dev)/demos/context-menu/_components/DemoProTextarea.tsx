"use client";

/**
 * DemoProTextarea — ProTextarea with demo-friendly defaults for context-menu
 * harness panels (voice, cleanup menu, auto-grow, iOS-safe 16px).
 */

import { ProTextarea, type ProTextareaProps } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

export interface DemoProTextareaProps extends ProTextareaProps {
  minHeightClass?: string;
  /** Use monospace stack (code editor demos). */
  mono?: boolean;
}

export function DemoProTextarea({
  className,
  minHeightClass,
  mono = false,
  autoGrow = true,
  minHeight = 180,
  maxHeight = 420,
  enableCleanup = true,
  ...props
}: DemoProTextareaProps) {
  return (
    <ProTextarea
      autoGrow={autoGrow}
      minHeight={minHeight}
      maxHeight={maxHeight}
      enableCleanup={enableCleanup}
      className={cn(
        "text-base w-full",
        mono && "font-mono",
        minHeightClass,
        className,
      )}
      {...props}
    />
  );
}
