"use client";

// The v2 categories, each with what the person gets and EVERY universal row the
// menu can produce that lands in it — read from the live rich-document action
// registry plus the menu engine's own rows, never a hand-written list. The page's
// own rows (a quiz's Open / Take, a note's Move to Folder…) differ per page; the
// ones the three contexts above resolved are listed under "This item".

import "@/features/rich-document/actions/handlers";
import { getAllActions, toAlchemyAction } from "@/features/rich-document/actions/provider";
import { CONTEXT_MENU_ENGINE_ID_PREFIXES, CONTEXT_MENU_ENGINE_ROWS } from "@/features/context-menu-v3/regroup/engine-rows";
import { matchRule, type MenuGrouping } from "@/features/context-menu-v3/regroup/grouping";
import type { RegroupAudit } from "@/features/context-menu-v3/regroup/grouping";
import type { Action } from "@ai-matrx/alchemy/actions";

interface Item {
  id: string;
  label: string;
}

/** A row whose label depends on state (Play / Stop, Pin / Unpin) is named from its id. */
function stateLabel(id: string): string {
  const words = id.replace(/^tts-/, "read aloud ").replace(/-/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function inventory(): { id: string; label: string; action: Pick<Action, "id" | "category" | "section"> }[] {
  const rich = getAllActions().map((rd) => {
    const action = toAlchemyAction(rd);
    return { id: rd.id, label: typeof rd.label === "string" ? rd.label : stateLabel(rd.id), action };
  });
  const engine = CONTEXT_MENU_ENGINE_ROWS.map((row) => ({
    id: row.id,
    label: row.label,
    action: { id: row.id, category: row.category },
  }));
  return [...engine, ...rich];
}

export function CategoriesTable({
  grouping,
  audits,
}: {
  grouping: MenuGrouping;
  audits: RegroupAudit[];
}) {
  const rows = inventory();
  const known = new Set(rows.map((r) => r.id));
  const byGroup = new Map<string, Item[]>();
  const top: Item[] = [];
  const uncategorized: Item[] = [];
  const pageOwnByContext: Item[] = [];
  for (const row of rows) {
    const rule = matchRule(grouping, row.action);
    const to = rule?.to ?? grouping.fallback;
    if (to.kind === "group") {
      const list = byGroup.get(to.key) ?? [];
      list.push({ id: row.id, label: row.label });
      byGroup.set(to.key, list);
    } else if (to.kind === "page-first") {
      pageOwnByContext.push({ id: row.id, label: row.label });
    } else if (rule) {
      top.push({ id: row.id, label: row.label });
    } else {
      uncategorized.push({ id: row.id, label: row.label });
    }
  }
  // Rows the live menus resolved that the inventory does not list: a page's own
  // rows (expected) and — the thing to fix — any universal row missing here.
  const seenOwn = new Map<string, Item>();
  const missing = new Map<string, Item>();
  for (const audit of audits) {
    for (const row of audit.rows) {
      if (known.has(row.id) || CONTEXT_MENU_ENGINE_ID_PREFIXES.some((p) => row.id.startsWith(p))) continue;
      if (row.proposed?.kind === "page-first") seenOwn.set(row.id, { id: row.id, label: row.label });
      else missing.set(row.id, { id: row.id, label: row.label });
    }
  }
  const own = [...pageOwnByContext, ...seenOwn.values()];

  const block = (key: string, label: string, definition: string, items: Item[], tone?: "warn") => (
    <tr key={key} className="border-t border-border align-top">
      <td className="w-40 px-3 py-2 font-semibold">{label}</td>
      <td className="w-72 px-3 py-2 text-muted-foreground">{definition}</td>
      <td className={tone === "warn" ? "px-3 py-2 text-destructive" : "px-3 py-2"}>
        {items.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          items.map((item, i) => (
            <span key={item.id}>
              {i > 0 ? " · " : ""}
              {item.label}
            </span>
          ))
        )}
      </td>
    </tr>
  );

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Categories — by what you get</h3>
        <p className="text-xs text-muted-foreground">
          {rows.length} universal rows in the registry, each placed below
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Category</th>
              <th className="px-3 py-1.5 font-medium">What you get</th>
              <th className="px-3 py-1.5 font-medium">Every item in it</th>
            </tr>
          </thead>
          <tbody>
            {block(
              "own",
              "This item (first)",
              "The clicked thing’s own actions — Open, Take, Edit questions, Move to Folder. Different on every page; shown first, never folded.",
              own,
            )}
            {block(
              "top",
              "Always at the top",
              "The icon strip (Copy, Cut, Paste, Undo, Redo, Find), Select All, Quick Actions and the page menu.",
              top,
            )}
            {grouping.groups.map((g) => block(g.key, `${g.label} ▸`, g.definition, byGroup.get(g.key) ?? []))}
            {uncategorized.length > 0
              ? block("none", "No category yet", "Rows no rule names — they stay at the top level until they get a home.", uncategorized, "warn")
              : null}
            {missing.size > 0
              ? block(
                  "missing",
                  "Not in the inventory",
                  "A live menu resolved these universal rows, but the inventory above does not list them.",
                  [...missing.values()],
                  "warn",
                )
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
