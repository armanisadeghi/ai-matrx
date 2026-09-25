// features/context-menu-v3/model/layouts.ts
//
// LAYOUTS — pure arrangements of the menu model. Each one answers "which nodes
// sit at the top level, which fold into a named submenu, which go into an icon
// strip" without touching a single handler.
//
//   classic  — the historical flat column (every section top-level).
//   tiered   — icon strip for the universal verbs (copy/cut/paste/undo/redo/
//              find); every other Classic row stays, by name, at the top
//              level — only History groups (Undo/Redo/View History/Compare)
//              and a surface's own section folds under the surface's label.
//              LOSSLESS: nothing is hidden or renamed (Arman's rule).
//   command  — tiered + a type-to-filter box. Typing flattens every leaf in
//              the whole model (including nested agents / shortcuts / content
//              blocks) into one ranked list with its breadcrumb.
//
// Surface sections ("extraSections") are the "minor local changes": in tiered /
// command a surface section with ≤ INLINE_SURFACE_MAX rows stays inline and a
// longer one becomes ONE submenu named by its label — the surface never has to
// know which layout is active.

import { Ellipsis, History as HistoryIcon } from "lucide-react";
import type {
  MenuLeafNode,
  MenuModel,
  MenuNode,
  MenuSection,
  MenuSubmenuNode,
} from "./menu-model";
import { hasActionable } from "./menu-model";
import type { ContextMenuLayout } from "../types";

/** Surface sections at or under this many rows stay inline in tiered/command. */
export const INLINE_SURFACE_MAX = 3;

export interface ArrangedMenu {
  /** Icon-only strip rendered above the body (empty in classic). */
  strip: MenuLeafNode[];
  /** Body sections; a separator is drawn between consecutive sections. */
  sections: MenuSection[];
}

function compact(nodes: Array<MenuNode | null | undefined>): MenuNode[] {
  return nodes.filter((n): n is MenuNode => n != null);
}

/** Drop leading / trailing / doubled separators. */
function tidy(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (n.kind === "separator") {
      if (out.length === 0 || out[out.length - 1].kind === "separator") continue;
    }
    out.push(n);
  }
  while (out.length && out[out.length - 1].kind === "separator") out.pop();
  return out;
}

function surfaceSections(sections: MenuSection[]): MenuSection[] {
  // A menu with a PRIMARY section has declared a target hierarchy (this cell ·
  // its row · its column · the table). Its inline siblings then keep their
  // headings so each group says what it acts on.
  const hierarchical = sections.some((s) => s.primary);
  return sections
    .map((s): MenuSection | null => {
      const nodes = tidy(s.nodes);
      if (!hasActionable(nodes)) return null;
      // The clicked target: inline, heading kept, NEVER folded — however long.
      if (s.primary) return { ...s, nodes };
      const rows = nodes.filter((n) => n.kind !== "separator" && n.kind !== "label");
      if (rows.length <= INLINE_SURFACE_MAX) {
        return { ...s, label: hierarchical ? s.label : undefined, nodes };
      }
      const fold: MenuSubmenuNode = {
        kind: "submenu",
        id: `${s.id}:fold`,
        label: s.label ?? "More",
        icon: s.icon ?? Ellipsis,
        width: "w-60",
        children: nodes,
      };
      return { ...s, label: undefined, nodes: [fold] };
    })
    .filter((s): s is MenuSection => s !== null);
}

/**
 * THE NO-DEAD-CONTROLS RULE (law 4 — "a screen is absent or honest — never
 * dead, disabled-looking, or lying"; RC-B6 verify 2026-09-25): a row the
 * person cannot use RIGHT NOW is absent, not greyed. Cut / Paste / Undo /
 * Redo / History appear only where they apply; a submenu whose every entry is
 * unavailable disappears with them (never a panel whose only row is dead).
 * Applied to every layout, so Classic and the others still show the SAME rows
 * (the lossless law holds — both prune identically).
 */
export function pruneUnavailable(nodes: MenuNode[]): MenuNode[] {
  const out: MenuNode[] = [];
  for (const node of nodes) {
    if (node.kind === "separator" || node.kind === "label") {
      out.push(node);
      continue;
    }
    if (node.kind === "submenu") {
      if (node.disabled || node.loading) {
        if (node.loading) out.push(node);
        continue;
      }
      const children = pruneUnavailable(node.children);
      if (!hasActionable(children) && !node.emptyLabel) continue;
      out.push({ ...node, children });
      continue;
    }
    if (node.disabled) continue;
    out.push(node);
  }
  return tidy(out);
}

function pruneArranged(arranged: ArrangedMenu): ArrangedMenu {
  return {
    strip: arranged.strip.filter((n) => !n.disabled),
    sections: arranged.sections
      .map((s) => ({ ...s, nodes: pruneUnavailable(s.nodes) }))
      .filter((s) => hasActionable(s.nodes)),
  };
}

export function arrangeMenu(
  model: MenuModel,
  layout: ContextMenuLayout,
): ArrangedMenu {
  return pruneArranged(arrangeMenuUnpruned(model, layout));
}

function arrangeMenuUnpruned(
  model: MenuModel,
  layout: ContextMenuLayout,
): ArrangedMenu {
  if (layout === "classic") {
    return { strip: [], sections: model.sections };
  }

  const r = model.roles;

  // ── THE LOSSLESS LAW (Arman, 2026-08-22): every row Classic shows exists
  //    here too, by its own name — and unavailable rows are pruned from BOTH
  //    identically (pruneUnavailable, law 4 supersedes the old greying), never
  //    renamed, never folded under a coined
  //    heading. The only grouping he approved is History (Undo / Redo / View
  //    History / Compare under one entry). A surface's own section folds into
  //    one submenu carrying the surface's OWN label (e.g. "Note").

  // Strip: the universal verbs, icon-only (greyed when unavailable).
  const strip: MenuLeafNode[] = [
    r.copy,
    r.speak,
    r.cut,
    r.paste,
    r.undo,
    r.redo,
    r.find,
  ];

  const sections: MenuSection[] = [];

  const surface = surfaceSections([
    ...r.extras["after-clipboard"],
    ...r.extras["after-compare"],
    ...r.extras["after-placements"],
  ]);

  // The thing the user right-clicked comes FIRST — above the universal rows —
  // and the rest of its hierarchy (its row, its column, the table) follows it
  // directly, so the pane's own groups read as one block and the platform's
  // rows as another, instead of interleaving.
  const hierarchical = surface.some((s) => s.primary);
  if (hierarchical) {
    sections.push(
      ...surface.filter((s) => s.primary),
      ...surface.filter((s) => !s.primary),
    );
  }

  // Clipboard tail — what the strip doesn't carry.
  sections.push({
    id: "clipboard",
    group: "clipboard",
    nodes: compact([r.listen, r.copyAs, r.json, r.selectAll, r.insertReference]),
  });

  // AI + libraries — every placement row, same names as Classic.
  if (r.placements.length) {
    sections.push({ id: "ai", group: "ai", nodes: [...r.placements] });
  }

  // Surface — "minor local changes" (notes ops, file ops, …), one fold
  // per section named by the surface.
  if (!hierarchical) sections.push(...surface);

  // History — the one approved grouping.
  const history: MenuSubmenuNode = {
    kind: "submenu",
    id: "history",
    label: "History",
    icon: HistoryIcon,
    iconClassName: "text-violet-500",
    width: "w-60",
    children: [r.undo, r.redo, r.viewHistory, { kind: "separator", id: "history:sep" }, r.compare],
  };
  sections.push({
    id: "document",
    group: "document",
    nodes: compact([history, r.exportMenu, r.convert, r.attach, r.share]),
  });

  // Tools.
  sections.push({
    id: "tools",
    group: "tools",
    nodes: compact([r.chat, r.quickActions]),
  });

  // Editable (core Save / Delete, when the surface wires them).
  const editableNodes = compact([r.save, r.del]);
  if (editableNodes.length) sections.push({ id: "editable", group: "editable", nodes: editableNodes });

  // Admin.
  if (r.admin) sections.push({ id: "admin", group: "admin", nodes: [r.admin] });

  // The page's surface — always last (where the footer used to be).
  sections.push(r.surfaceInfo);

  return { strip, sections: sections.filter((s) => s.nodes.length > 0) };
}

// ---------------------------------------------------------------------------
// Filter — type-to-find across the WHOLE model.
// ---------------------------------------------------------------------------

export interface FilteredLeaf {
  node: MenuLeafNode;
  /** Ancestor submenu labels, outermost first. */
  path: string[];
  score: number;
}

function collectLeaves(
  nodes: MenuNode[],
  path: string[],
  out: Array<{ node: MenuLeafNode; path: string[] }>,
  seen: Set<string>,
): void {
  for (const n of nodes) {
    if (n.kind === "separator" || n.kind === "label") continue;
    if (n.kind === "submenu") {
      collectLeaves(n.children, [...path, n.label], out, seen);
      continue;
    }
    if (n.disabled) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({ node: n, path });
  }
}

/** Every actionable leaf in the model, de-duplicated by id. */
export function collectAllLeaves(model: MenuModel): Array<{ node: MenuLeafNode; path: string[] }> {
  const out: Array<{ node: MenuLeafNode; path: string[] }> = [];
  const seen = new Set<string>();
  for (const s of model.sections) collectLeaves(s.nodes, s.label ? [s.label] : [], out, seen);
  return out;
}

/**
 * Case- and diacritic-insensitive fold: "Résumé" matches "resume" and
 * vice-versa. NFD splits base chars from combining marks; the marks are
 * stripped before lowercasing.
 */
export function foldForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Rank leaves against a query. Empty query → []. Prefix > word-start > substring > path. */
export function filterLeaves(
  leaves: Array<{ node: MenuLeafNode; path: string[] }>,
  query: string,
  limit = 40,
): FilteredLeaf[] {
  const q = foldForMatch(query.trim());
  if (!q) return [];
  const scored: FilteredLeaf[] = [];
  for (const l of leaves) {
    const label = foldForMatch(l.node.label);
    const pathText = foldForMatch(l.path.join(" "));
    let score = 0;
    if (label.startsWith(q)) score = 4;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 3;
    else if (label.includes(q)) score = 2;
    else if (pathText.includes(q)) score = 1;
    if (score > 0) scored.push({ ...l, score });
  }
  scored.sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label));
  return scored.slice(0, limit);
}
