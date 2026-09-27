"use client";

/**
 * FocusLayer — the focused tile, full size, over a dimmed board.
 *
 * Not browser fullscreen: the tile fills the BOARD area, the page chrome
 * stays. The board keeps running underneath (streams keep streaming); the
 * tile itself portals its card into `host` so it is the same live component,
 * not a copy. Esc, the close button or a click on the dimmed board returns to
 * exactly the camera the person left; arrows step through tiles in reading
 * order (Figma presentation, Miro focus mode).
 */

import { ChevronLeft, ChevronRight, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusedTile, useSpatialStore } from "../engine/react";

export function FocusLayer({ onHost }: { onHost: (el: HTMLElement | null) => void }) {
  const store = useSpatialStore();
  const focused = useFocusedTile();
  const order = focused ? store.readingOrder() : [];
  const at = focused ? order.indexOf(focused) + 1 : 0;

  return (
    <div
      data-spatial-focus
      data-spatial-chrome
      aria-hidden={!focused}
      className={cn(
        "absolute inset-0 z-40 flex flex-col transition-opacity duration-200",
        focused ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <button
        type="button"
        aria-label="Leave focus"
        tabIndex={-1}
        onClick={() => store.unfocus()}
        className="absolute inset-0 cursor-default bg-background/75 backdrop-blur-[2px]"
      />
      {focused && (
        <div className="relative z-10 flex h-12 shrink-0 items-center gap-1 px-4">
          <FocusButton label="Previous tile (←)" onClick={() => store.focusStep(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </FocusButton>
          <span className="min-w-14 text-center font-mono text-xs tabular-nums text-muted-foreground">
            {`${at} of ${order.length}`}
          </span>
          <FocusButton label="Next tile (→)" onClick={() => store.focusStep(1)}>
            <ChevronRight className="h-4 w-4" />
          </FocusButton>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => store.unfocus()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Back to board
            <kbd className="ml-1 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </button>
        </div>
      )}
      <div ref={onHost} className="relative z-10 min-h-0 flex-1 px-4 pb-4" />
    </div>
  );
}

function FocusButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
