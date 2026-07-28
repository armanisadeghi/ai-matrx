"use client";

import { Separator, type SeparatorProps } from "react-resizable-panels";
import { cn } from "@/styles/themes/utils";
import { usePanelControlsOptional } from "./PanelControlProvider";

interface HandleProps extends SeparatorProps {
  /** When ANY of the named registered panels is currently collapsed, this
   *  Handle returns null. Prevents users from grabbing a sliver of separator
   *  next to a 0%-width panel and dragging it back open — the toggle button
   *  becomes the only way to expand. */
  hideWhenCollapsed?: string[];
}

// Orientation-aware Separator wrapper used by every demo.
// Reads aria-orientation (set by the lib based on parent Group orientation):
//   - vertical Separator (in horizontal group)   → 0.5 wide bar, col-resize cursor
//   - horizontal Separator (in vertical group)   → 0.5 tall bar, row-resize cursor
// `focus:outline-none` suppresses the browser's default focus outline; the
// data-separator state classes paint primary on hover/active/dragging.
export function Handle({
  hideWhenCollapsed,
  className,
  ...props
}: HandleProps) {
  const controls = usePanelControlsOptional();
  if (
    hideWhenCollapsed &&
    controls &&
    hideWhenCollapsed.some((name) => controls.isCollapsed(name))
  ) {
    return null;
  }

  return (
    <Separator
      {...props}
      className={cn(
        "bg-border focus:outline-none transition-colors",
        "data-[separator=hover]:bg-primary",
        "data-[separator=active]:bg-primary",
        "data-[separator=dragging]:bg-primary",
        "[&[aria-orientation=vertical]]:w-0.5 [&[aria-orientation=vertical]]:cursor-col-resize",
        "[&[aria-orientation=horizontal]]:h-0.5 [&[aria-orientation=horizontal]]:cursor-row-resize",
        className,
      )}
    />
  );
}
