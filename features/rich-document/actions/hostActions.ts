// features/rich-document/actions/hostActions.ts
//
// Host-owned actions a surface adds to its one action bar through the
// `actions.extra` prop (they register nowhere else). Replaces the bespoke
// trash/extra buttons ContentActionBar used to draw beside its registry
// (ALC-15 S4): every row of the bar now comes from one model.

import { Files, Trash2 } from "lucide-react";
import type { RichDocumentAction } from "../types";

/** "Clear" — the host empties its own content (a transcript pad). */
export function clearContentAction(
  onClear: () => void,
  label = "Clear",
): RichDocumentAction {
  return {
    id: "host:clear-content",
    label,
    icon: Trash2,
    iconColor: "text-muted-foreground",
    category: "edit",
    supportedSources: "*",
    renderSlot: "both",
    order: 90,
    run: () => onClear(),
  };
}

/** A host copy that joins more than this content (transcript + cleaned text). */
export function hostCopyAction(
  id: string,
  label: string,
  run: () => void | Promise<void>,
): RichDocumentAction {
  return {
    id: `host:${id}`,
    label,
    icon: Files,
    iconColor: "text-muted-foreground",
    category: "copy",
    supportedSources: "*",
    renderSlot: "both",
    order: 80,
    run: () => run(),
  };
}
