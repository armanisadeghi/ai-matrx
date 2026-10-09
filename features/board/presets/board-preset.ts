/**
 * BOARD PRESET — the same board, with a focus. A preset changes only WHAT IS
 * OFFERED FIRST: the Add menu and Start panel show `featured` at the top level
 * and fold `more` behind a "…" control; `hidden` types are not offered anywhere,
 * and the board's agent cannot add them either (same list feeds `itemTypes`).
 * With no preset the board behaves exactly as before. Guest filtering
 * (`guestSafe`) applies first, then the preset.
 *
 * An entry in `featured` / `more` / `hidden` is an item key (`"note"`) or a group
 * (`"group:media"`, a `BoardItemGroup`). `more: "rest"` = every other type.
 * Adding a type to a preset is one string in `presets/registry.ts`; the guard
 * `__tests__/board-presets.test.ts` fails on a key the catalog does not have.
 */

import type { BoardDocument } from "../board/document";
import type { BoardTool } from "../engine/tools";
import type { BoardItemGroup, BoardItemType } from "../items/types";

export type PresetEntry = string;

export interface BoardPreset {
  key: string;
  label: string;
  /** Offered at the top level of the Add menu and Start panel, in this order. */
  featured: readonly PresetEntry[];
  /** Behind the "…" control; "rest" = every type not featured or hidden. */
  more: readonly PresetEntry[] | "rest";
  /** Not offered at all (menus and agent). */
  hidden?: readonly PresetEntry[];
  /** Seam for starter boards / templates: a template id or a factory. None ship yet. */
  starter?: string | (() => BoardDocument);
  /** The default agent for this board's chat. Seam: the chat workspace has no agent prop yet. */
  agentId?: string;
  /** Which board tools show (default: all). */
  toolbar?: readonly BoardTool[];
}

export interface PresetTypes {
  featured: readonly BoardItemType[];
  more: readonly BoardItemType[];
  /** featured + more: what the person and the agent may add. */
  allowed: readonly BoardItemType[];
}

const GROUP_PREFIX = "group:";

function expand(entries: readonly PresetEntry[], types: readonly BoardItemType[]): BoardItemType[] {
  const out: BoardItemType[] = [];
  for (const e of entries) {
    if (e.startsWith(GROUP_PREFIX)) {
      const g = e.slice(GROUP_PREFIX.length) as BoardItemGroup;
      out.push(...types.filter((t) => t.group === g));
    } else {
      const t = types.find((x) => x.key === e);
      if (t) out.push(t);
    }
  }
  return out;
}

/** Split `types` (already guest-filtered) by the preset. No preset: everything featured, nothing behind "…". */
export function resolvePresetTypes(preset: BoardPreset | undefined, types: readonly BoardItemType[]): PresetTypes {
  if (!preset) return { featured: types, more: [], allowed: types };
  const hidden = new Set(expand(preset.hidden ?? [], types));
  const featured = [...new Set(expand(preset.featured, types))].filter((t) => !hidden.has(t));
  const shown = new Set(featured);
  const more =
    preset.more === "rest"
      ? types.filter((t) => !hidden.has(t) && !shown.has(t))
      : [...new Set(expand(preset.more, types))].filter((t) => !hidden.has(t) && !shown.has(t));
  return { featured, more, allowed: [...featured, ...more] };
}

/** Every entry that is neither a catalog key nor `group:<known group>` (the guard test's check). */
export function badPresetEntries(
  preset: BoardPreset,
  keys: ReadonlySet<string>,
  groups: ReadonlySet<string>,
): string[] {
  const all = [...preset.featured, ...(preset.more === "rest" ? [] : preset.more), ...(preset.hidden ?? [])];
  return all.filter((e) => (e.startsWith(GROUP_PREFIX) ? !groups.has(e.slice(GROUP_PREFIX.length)) : !keys.has(e)));
}
