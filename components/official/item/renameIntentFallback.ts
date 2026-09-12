// components/official/item/renameIntentFallback.ts
//
// THE FALLBACK BEHIND `intent: "rename"`.
//
// `ItemMenuCommand.intent = "rename"` is a declarative hook: `ItemRow`
// intercepts it and drives its inline editor INSTEAD of running `onSelect`
// (see ./ItemRow.tsx `mapRenameIntent`). Its own doc comment in ./types.ts
// already said what the entry owes the other half of the contract — "keep a
// dialog fallback there for non-row surfaces" — and two registries shipped
//
//     onSelect: () => {}
//
// instead. In a host that is not an ItemRow, that is a menu row which looks
// clickable, is not disabled, and does nothing at all: the exact defect
// `check:context-menu`'s LIVE-ITEM LAW exists to catch (2026-09-11).
//
// A stand-in must announce itself with a remedy rather than sit there silently
// (the loud-patches law), so this is the one place that does it. One helper,
// every `intent: "rename"` entry, no per-file taste.

import { toast } from "@/lib/toast";

/**
 * The `onSelect` an `intent: "rename"` entry carries. It NEVER runs on an
 * `ItemRow` — that host replaces it with its inline editor. It runs only where
 * inline rename does not exist, and there it says so instead of pretending.
 *
 * @param what  The noun, for the message: "note", "conversation", "agent".
 */
export function renameIntentFallback(what: string): () => void {
  return () => {
    toast.error(`Renaming this ${what} isn't available here`, {
      description: `Open the ${what} — or use a list that supports inline rename — to change its name.`,
    });
  };
}
