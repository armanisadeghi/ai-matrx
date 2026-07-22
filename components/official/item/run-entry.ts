/**
 * components/official/item/run-entry.ts
 *
 * Action dispatch for ItemMenu entries — shared by the kebab/dropdown
 * renderer (ItemMenu.tsx), the drawer, and the v3 context-menu converter
 * (itemMenuToV3.ts), so command/toggle semantics (sync-in-gesture execution,
 * sonner toast.promise, fire-and-forget promise swallow) can never drift
 * between presentations.
 */

import { toast } from "@/lib/toast";
import type { ItemMenuCheckbox, ItemMenuCommand } from "./types";

export function runCommand(entry: ItemMenuCommand) {
  const result = entry.onSelect();
  if (result instanceof Promise) {
    if (entry.toast) {
      const { loading, success, error } = entry.toast;
      toast.promise(result, {
        loading,
        success,
        error: (e) =>
          typeof error === "function"
            ? error(e)
            : (error ?? "Something went wrong"),
      });
    } else {
      result.catch(() => {});
    }
  }
}

export function runToggle(entry: ItemMenuCheckbox, next: boolean) {
  const result = entry.onCheckedChange(next);
  if (result instanceof Promise) result.catch(() => {});
}
