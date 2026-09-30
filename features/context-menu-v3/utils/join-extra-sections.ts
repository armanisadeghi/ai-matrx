/**
 * ONE MENU, SEVERAL SOURCES OF SURFACE ROWS — joined so every row id is unique.
 *
 * A menu's surface sections can come from more than one owner for one open: a table row's
 * descriptor plus the grid's per-target sections, or the content's own sections plus the RECORD
 * it belongs to (record-menu-registry.ts — a note's tab rows join the menu opened on the note's
 * content). Each owner keeps its own ids unique, but not across owners, and the menu model
 * namespaces every surface row as `x:<id>` (menu-model.ts) — so the same id from two owners
 * reached the one Alchemy registry twice and it refused the second:
 * `DuplicateActionError: Action "cm:x:save" is yielded twice by provider "context-menu:…"`
 * (/notes, 2026-09-30: the editor's "Save" and the tab's "Save", both saving the same note).
 *
 * Sources are passed in precedence order. Two owners describing one target with the same id
 * mean the same action on it, so the FIRST source's row stands and a later source's row with
 * that id is not drawn a second time. A duplicate inside ONE source is that source's own defect
 * and is left untouched, so the registry still refuses it loudly.
 */
import type { ContextMenuExtraItem, ContextMenuExtraSection } from "../types";

function isRow(item: ContextMenuExtraItem): boolean {
  return item.kind !== "separator";
}

/** Drop leading, trailing and doubled separators left behind when rows are removed. */
function tidySeparators(items: ContextMenuExtraItem[]): ContextMenuExtraItem[] {
  const out: ContextMenuExtraItem[] = [];
  for (const item of items) {
    if (!isRow(item) && (out.length === 0 || !isRow(out[out.length - 1]))) continue;
    out.push(item);
  }
  while (out.length > 0 && !isRow(out[out.length - 1])) out.pop();
  return out;
}

export function joinExtraSections(
  ...sources: Array<ContextMenuExtraSection[] | null | undefined>
): ContextMenuExtraSection[] | undefined {
  const present = sources.filter((s): s is ContextMenuExtraSection[] => Array.isArray(s));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const taken = new Set<string>();
  const out: ContextMenuExtraSection[] = [];
  for (const source of present) {
    const ownIds = new Set<string>();
    for (const section of source) {
      const kept = section.items.filter((item) => !isRow(item) || !taken.has(item.id));
      for (const item of kept) if (isRow(item)) ownIds.add(item.id);
      if (kept.length === section.items.length) {
        out.push(section);
        continue;
      }
      const items = tidySeparators(kept);
      if (items.some(isRow)) out.push({ ...section, items });
    }
    for (const id of ownIds) taken.add(id);
  }
  return out;
}
