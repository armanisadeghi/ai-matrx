"use client";

/**
 * FocusLayer — the focused tile, full screen, over a dimmed page.
 *
 * FULL SCREEN CAN NEVER TRAP. The layer is portalled to `document.body` and
 * fixed to the VIEWPORT (inset 0, h-dvh) — never sized from the tile, the
 * camera or the board pane — so nothing the tile's content does (a chat that
 * grows, a pane that collapses beside the board) can move the way out. The
 * exit bar is a fixed-height row at the top, outside the content, always on
 * screen, with a touch-size button on phones. Escape ALWAYS exits, even from
 * inside an editor or a chat composer (a capture-phase listener runs before
 * the content's own key handling); only an open menu, popover or listbox gets
 * the key first. The board keeps running underneath (streams keep
 * streaming); the tile portals its card into `host`, so it is the same live
 * component, not a copy. Esc, the button or a click on the dim returns to
 * exactly the camera the person left; arrows step through tiles in reading
 * order (Figma presentation, Miro focus mode).
 */

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { aMenuOrPopoverIsOpen } from "@/features/shell/canvas-chrome/open-layer";
import { useFocusedTile, useSpatialStore } from "../engine/react";

const noSubscribe = () => () => {};

export function FocusLayer({ onHost }: { onHost: (el: HTMLElement | null) => void }) {
  const store = useSpatialStore();
  const focused = useFocusedTile();
  // Portal only on the client (the server has no body to portal into).
  const onClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  const order = focused ? store.readingOrder() : [];
  const at = focused ? order.indexOf(focused) + 1 : 0;

  // Escape always leaves — before the content (a composer, an editor) can
  // swallow it. An open menu / popover / listbox keeps the key for itself.
  useEffect(() => {
    if (!focused) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (aMenuOrPopoverIsOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      store.unfocus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focused, store]);

  const layer = (
    <div
      data-spatial-focus
      data-spatial-chrome
      aria-hidden={!focused}
      role={focused ? "dialog" : undefined}
      aria-modal={focused ? true : undefined}
      aria-label={focused ? "Full screen tile" : undefined}
      className={cn(
        "fixed inset-0 z-50 flex h-dvh w-screen max-w-none flex-col pb-safe transition-opacity duration-200",
        focused ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <button
        type="button"
        aria-label="Leave full screen"
        tabIndex={-1}
        onClick={() => store.unfocus()}
        className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-[2px]"
      />
      {focused && (
        <div className="relative z-10 flex h-14 shrink-0 items-center gap-1 px-3 sm:px-4">
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
            data-spatial-focus-exit
            onClick={() => store.unfocus()}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm hover:bg-accent sm:h-9"
          >
            <X className="h-4 w-4" />
            <span>Close</span>
            <kbd className="ml-1 hidden rounded border border-border px-1 font-mono text-[10px] text-muted-foreground sm:inline">
              Esc
            </kbd>
          </button>
        </div>
      )}
      <div ref={onHost} className="relative z-10 min-h-0 flex-1 overflow-hidden px-2 pb-2 sm:px-4 sm:pb-4" />
    </div>
  );

  return onClient ? createPortal(layer, document.body) : null;
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
