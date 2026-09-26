"use client";

// features/context-menu-v3/components/OpenSurfaceMenuButton.tsx
//
// A ⋯ for a surface whose ONE menu otherwise opens only by right-click (the
// data grid): it opens that surface's own menu — the same shell, the same
// engine, the same rows — anchored at the button, never a second menu
// (ALC-15 verifier finding 3). The event lands ON the surface element, so a
// per-target resolver answers at the surface level (the table, no cell).

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OpenSurfaceMenuButton({
  getSurface,
  label = "More actions",
  className,
}: {
  /** The element the surface's context-menu shell wraps. */
  getSurface: () => HTMLElement | null;
  label?: string;
  className?: string;
}): React.ReactElement {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 p-0", className)}
      aria-label={label}
      aria-haspopup="menu"
      onClick={() => {
        const surface = getSurface();
        const button = buttonRef.current;
        if (!surface || !button) return;
        const rect = button.getBoundingClientRect();
        surface.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: rect.left + rect.width / 2,
            clientY: rect.bottom,
          }),
        );
      }}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}
