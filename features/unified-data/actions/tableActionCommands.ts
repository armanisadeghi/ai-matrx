"use client";

// features/unified-data/actions/tableActionCommands.ts — lane TABLE-ACTIONS wave 4 (item 17, T4.1)
//
// THE TABLE'S ACTIONS ARE ⌘K COMMANDS — the third renderer of the one list (after the ⋯ menus and
// the right-click), into the ONE command bar (`features/knowledge/command-bar`, plain ⌘K) through
// its page-command registry (`registerPageCommands`). Every action with a label is a command with
// the same id, label, chord (`shortcut`, from records-ui `TABLE_ACTION_KEYS`) and disabled reason,
// and running it calls the menu entry's own `run` — never a second implementation. G4
// (`__tests__/every-table-action-is-a-command.test.ts`) holds it.

import { useEffect, useRef } from "react";
import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";
import type { ItemMenuConfig, ItemMenuEntry } from "@ai-matrx/chat/ui/item-types";
import { registerPageCommands, type KnowledgeCommand } from "@/features/knowledge/command-bar/commands";
import { OBJECT_ACTION_ICONS } from "./tableActionAdapters";

/** The group word each command shows (the table's own name, so two tables never read alike). */
export function toKnowledgeCommands(actions: readonly ObjectAction[], group: string): KnowledgeCommand[] {
  return actions
    .filter((a) => a.label.trim() !== "")
    .map((a) => ({
      id: `table-action:${a.id}`,
      label: a.label,
      group,
      icon: OBJECT_ACTION_ICONS[a.icon],
      keywords: ["table", ...(a.verb ? [a.verb] : [])],
      ...(a.shortcut ? { shortcut: a.shortcut } : {}),
      ...(a.disabledReason !== undefined ? { disabledReason: a.disabledReason } : {}),
      run: () => void a.run(),
    }));
}

/**
 * A row menu as commands (the Data home's focused row): every command entry of the menu the row's
 * ⋯ draws, submenus flattened, with the entry's own `onSelect`. Links and drawn-content submenus
 * (Alchemy) are menu-only.
 */
export function itemMenuToCommands(config: ItemMenuConfig, group: string): KnowledgeCommand[] {
  const walk = (entries: readonly ItemMenuEntry[]): KnowledgeCommand[] =>
    entries.flatMap((e): KnowledgeCommand[] => {
      if (e.hidden) return [];
      if (e.kind === "submenu") return e.renderContent ? [] : e.sections.flatMap((s) => walk(s.items));
      if (e.kind === "link" || e.kind === "checkbox") return [];
      return [
        {
          id: `table-action:${e.id}`,
          label: e.label,
          group,
          ...(e.icon ? { icon: e.icon } : {}),
          keywords: ["table"],
          ...(e.shortcut ? { shortcut: e.shortcut } : {}),
          ...(e.disabled ? { disabledReason: e.disabledReason ?? "Not available here" } : {}),
          run: () => void e.onSelect(),
        },
      ];
    });
  return config.sections.flatMap((s) => walk(s.items));
}

/**
 * The table page's commands: pass the returned callback as `TablePage.onActions`. The bar reads
 * the latest list when it opens; the page itself answers the chords.
 */
export function useTablePageCommands(tableName: string | null): (actions: readonly ObjectAction[]) => void {
  const latest = useRef<readonly ObjectAction[]>([]);
  const name = useRef(tableName);
  name.current = tableName;
  useEffect(() => registerPageCommands(() => toKnowledgeCommands(latest.current, name.current ?? "This table")), []);
  return (actions) => {
    latest.current = actions;
  };
}

/**
 * A LIST'S FOCUSED ROW AS ⌘K COMMANDS (the Data home). Wrap the shell's `useRowActions` with the
 * returned `wrap`: the bar, when it opens, reads the row the person last focused (keyboard ↑/↓ or
 * a click — the shell marks rows `data-row-id`) and offers that row's own menu as commands.
 */
export function useFocusedRowCommands<TRow>(
  idOf: (row: TRow) => string,
  nameOf: (row: TRow) => string,
): <R extends { actions: { menuFor: (row: TRow) => () => ItemMenuConfig } }>(result: R, rows: readonly TRow[]) => R {
  const latest = useRef<{ rows: readonly TRow[]; menuFor: ((row: TRow) => () => ItemMenuConfig) | null }>({ rows: [], menuFor: null });
  const focusedId = useRef<string | null>(null);
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const el = (event.target as Element | null)?.closest?.("[data-row-id]");
      if (el) focusedId.current = el.getAttribute("data-row-id");
    };
    document.addEventListener("focusin", onFocus);
    const off = registerPageCommands(() => {
      const { rows, menuFor } = latest.current;
      const row = focusedId.current ? rows.find((r) => idOf(r) === focusedId.current) : undefined;
      return row && menuFor ? itemMenuToCommands(menuFor(row)(), nameOf(row)) : [];
    });
    return () => {
      document.removeEventListener("focusin", onFocus);
      off();
    };
  }, [idOf, nameOf]);
  return (result, rows) => {
    latest.current = { rows, menuFor: result.actions.menuFor };
    return result;
  };
}
