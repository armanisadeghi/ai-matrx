"use client";

/**
 * The global suggestion inbox as a canvas tab (`kg-suggestions`) — one tab,
 * keyed "inbox", so every door (the nav button, the new-suggestion toast)
 * focuses the same tab. It sits beside the page and beside the source previews
 * it opens. The inbox is read again each time, so the tab comes back after a
 * reload. Light: the body loads only when the tab renders.
 */

import { ArrowUpRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import { defineCanvasKind, type AnyCanvasKind, type CanvasKindProps } from "@ai-matrx/canvas/react";
import { useToolOpener } from "@/features/canvas/host/toolCanvas";

export const KG_SUGGESTIONS_KIND = "kg-suggestions";
export const SUGGESTIONS_TAB_TITLE = "Suggestions";

/** The pane-header door to the full manager. */
function OpenManager({ item, canvas }: CanvasKindProps) {
  return (
    <Link
      href="/suggestions"
      onClick={() => canvas.close(item.id)}
      aria-label="Open full manager"
      title="Open full manager"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

export const KG_SUGGESTIONS_CANVAS_KIND: AnyCanvasKind = defineCanvasKind({
  id: KG_SUGGESTIONS_KIND,
  surface: "dom",
  label: SUGGESTIONS_TAB_TITLE,
  icon: Lightbulb,
  load: () => import("./SuggestionsInboxCanvasView"),
  restore: true,
  HeaderAction: OpenManager,
});

/** Opens (or focuses) the suggestion inbox tab. */
export function useOpenKgSuggestions() {
  const open = useToolOpener((_: null) => ({
    kind: KG_SUGGESTIONS_KIND,
    key: "inbox",
    title: SUGGESTIONS_TAB_TITLE,
    data: null,
  }));
  return () => open(null);
}
