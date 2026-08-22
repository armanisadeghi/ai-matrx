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
  return sections
    .map((s): MenuSection | null => {
      const nodes = tidy(s.nodes);
      if (!hasActionable(nodes)) return null;
      const rows = nodes.filter((n) => n.kind !== "separator" && n.kind !== "label");
      if (rows.length <= INLINE_SURFACE_MAX) {
        return { ...s, label: undefined, nodes };
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

export function arrangeMenu(
  model: MenuModel,
  layout: ContextMenuLayout,
): ArrangedMenu {
  if (layout === "classic") {
    return { strip: [], sections: model.sections };
  }

  const r = model.roles;

  // ── THE LOSSLESS LAW (Arman, 2026-08-22): every row Classic shows exists
  //    here too, by its own name — greyed when unavailable exactly like
  //    Classic, NEVER hidden, never renamed, never folded under a coined
  //    heading. The only grouping he approved is History (Undo / Redo / View
  //    History / Compare under one entry). A surface's own section folds into
  //    one submenu carrying the surface's OWN label (e.g. "Note").

  // Strip: the universal verbs, icon-only (greyed when unavailable).
  const strip: MenuLeafNode[] = [r.copy, r.cut, r.paste, r.undo, r.redo, r.find];

  const sections: MenuSection[] = [];

  // Clipboard tail — what the strip doesn't carry.
  sections.push({
    id: "clipboard",
    group: "clipboard",
    nodes: compact([r.copyAs, r.json, r.selectAll]),
  });

  // AI + libraries — every placement row, same names as Classic.
  if (r.placements.length) {
    sections.push({ id: "ai", group: "ai", nodes: [...r.placements] });
  }

  // Surface — "minor local changes" (notes ops, file ops, …), one fold
  // per section named by the surface.
  sections.push(
    ...surfaceSections([
      ...r.extras["after-clipboard"],
      ...r.extras["after-compare"],
      ...r.extras["after-placements"],
    ]),
  );

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

/** Rank leaves against a query. Empty query → []. Prefix > word-start > substring > path. */
export function filterLeaves(
  leaves: Array<{ node: MenuLeafNode; path: string[] }>,
  query: string,
  limit = 40,
): FilteredLeaf[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: FilteredLeaf[] = [];
  for (const l of leaves) {
    const label = l.node.label.toLowerCase();
    const pathText = l.path.join(" ").toLowerCase();
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
