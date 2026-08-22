// features/context-menu-v3/model/layouts.ts
//
// LAYOUTS — pure arrangements of the menu model. Each one answers "which nodes
// sit at the top level, which fold into a named submenu, which go into an icon
// strip" without touching a single handler.
//
//   classic  — the historical flat column (every section top-level).
//   tiered   — icon strip for the universal verbs (copy/cut/paste/undo/redo/
//              find) + ≤ ~8 grouped rows; the long tail folds into a few named
//              submenus (Library, Share & Export, More, the surface's own
//              section). Inapplicable rows are HIDDEN, not greyed.
//   command  — tiered + a type-to-filter box. Typing flattens every leaf in
//              the whole model (including nested agents / shortcuts / content
//              blocks) into one ranked list with its breadcrumb.
//
// Surface sections ("extraSections") are the "minor local changes": in tiered /
// command a surface section with ≤ INLINE_SURFACE_MAX rows stays inline and a
// longer one becomes ONE submenu named by its label — the surface never has to
// know which layout is active.

import { Ellipsis, Library, Share2 } from "lucide-react";
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

/** A submenu whose children are flattened into labelled groups. */
function flattenedGroup(
  id: string,
  sub: MenuSubmenuNode | null,
): MenuNode[] {
  if (!sub || !hasActionable(sub.children)) return [];
  return [
    { kind: "label", id: `${id}:label`, label: sub.label.toUpperCase() },
    ...sub.children,
  ];
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
        icon: Ellipsis,
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

  // ── Strip: the universal verbs, icon-only. Hidden (not greyed) when the
  //    surface can never do them; greyed when merely unavailable right now.
  const strip: MenuLeafNode[] = [r.copy, r.cut, r.paste, r.undo, r.redo, r.find].filter(
    (n) => !(n.kind === "item" && n.inapplicable),
  );

  const sections: MenuSection[] = [];

  // ── Contextual (content-aware) — only when it applies.
  if (r.json) sections.push({ id: "contextual", group: "clipboard", nodes: [r.json] });

  // ── AI — the intelligence is what the menu is FOR; it stays at the top.
  const aiActions = r.placements.find((p) => p.placement === "ai-action");
  const agents = r.placements.find((p) => p.placement === "bound-agent");
  const libraryParts = r.placements.filter(
    (p) => p.placement !== "ai-action" && p.placement !== "bound-agent",
  );
  const libraryChildren = tidy(
    libraryParts.flatMap((p, i) =>
      hasActionable(p.children) || p.loading
        ? [
            ...(i > 0 ? [{ kind: "separator" as const, id: `lib:${p.id}:sep` }] : []),
            ...flattenedGroup(`lib:${p.id}`, p),
          ]
        : [],
    ),
  );
  const libraryLoading = libraryParts.some((p) => p.loading);
  const library: MenuSubmenuNode | null =
    libraryChildren.length > 0 || libraryLoading
      ? {
          kind: "submenu",
          id: "library",
          label: "Library",
          icon: Library,
          iconClassName: "text-violet-500",
          loading: libraryLoading,
          disabled: libraryChildren.length === 0,
          emptyLabel: "Loading…",
          width: "w-64",
          children: libraryChildren,
        }
      : null;
  const aiNodes = compact([
    aiActions && (hasActionable(aiActions.children) || aiActions.loading) ? aiActions : null,
    agents && (hasActionable(agents.children) || agents.loading) ? agents : null,
    library,
  ]);
  if (aiNodes.length) sections.push({ id: "ai", group: "ai", nodes: aiNodes });

  // ── Surface — the "minor local changes" (notes ops, file ops, …).
  sections.push(
    ...surfaceSections([
      ...r.extras["after-clipboard"],
      ...r.extras["after-compare"],
      ...r.extras["after-placements"],
    ]),
  );

  // ── Share & Export — everything that moves the content somewhere else.
  const shareChildren = tidy([
    ...flattenedGroup("se:copy-as", r.copyAs),
    { kind: "separator", id: "se:sep1" },
    ...flattenedGroup("se:export", r.exportMenu),
    { kind: "separator", id: "se:sep2" },
    ...flattenedGroup("se:convert", r.convert),
    { kind: "separator", id: "se:sep3" },
    ...compact([r.attach, r.share]),
    { kind: "separator", id: "se:sep4" },
    r.compare,
  ]);
  const shareExport: MenuSubmenuNode = {
    kind: "submenu",
    id: "share-export",
    label: "Share & Export",
    icon: Share2,
    iconClassName: "text-emerald-500",
    width: "w-64",
    children: shareChildren,
  };

  // ── More — the rarely-used tail, still one click away.
  const moreChildren = tidy([
    r.selectAll,
    ...(r.viewHistory.inapplicable ? [] : [r.viewHistory]),
    r.chat,
    { kind: "separator", id: "more:sep1" },
    ...flattenedGroup("more:quick", r.quickActions),
  ]);
  const more: MenuSubmenuNode = {
    kind: "submenu",
    id: "more",
    label: "More",
    icon: Ellipsis,
    iconClassName: "text-muted-foreground",
    width: "w-56",
    children: moreChildren,
  };
  sections.push({ id: "document", group: "document", nodes: [shareExport, more] });

  // ── Editable (core Save / Delete, when the surface wires them).
  const editableNodes = compact([r.save, r.del]);
  if (editableNodes.length) sections.push({ id: "editable", group: "editable", nodes: editableNodes });

  // ── Admin.
  if (r.admin) sections.push({ id: "admin", group: "admin", nodes: [r.admin] });

  return { strip, sections };
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
