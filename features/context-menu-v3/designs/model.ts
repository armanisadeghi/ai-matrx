// features/context-menu-v3/designs/model.ts
//
// A design spec (catalog.ts) → real `@ai-matrx/alchemy` Actions (what the
// package's ContextMenuPanel / ActionSheet resolve and draw) and the real
// MenuModel (`buildMenuModel`) with every submenu filled, which the counts and
// the demo-local layout below walk. Demo-only.
//
// Sections: the package groups rows by category, in GROUP_ORDER. Each spec
// section gets its own category from SECTION_CATEGORIES (in GROUP_ORDER), so
// section i is drawn i-th with a divider between — no coined headings.

import { createClickTarget, type Action, type ActionCategory, type ClickTarget, type Eligibility, type ResolvedAction } from "@ai-matrx/alchemy/actions";
import { actionToNode, buildMenuModel, withExpandedChildren, type MenuLeafNode, type MenuModel, type MenuNode, type MenuSection } from "@ai-matrx/alchemy/menu";
import { TODAY_ALL_GENERIC_IDS, TODAY_ROW_IDS, type DNode, type DesignSpec } from "./catalog";

const SECTION_CATEGORIES: readonly ActionCategory[] = ["edit", "copy", "save", "history", "ai", "listen", "feedback", "admin", "surface-info"];

export type RunHandler = (label: string) => void;

export function demoTarget(selection: string | null): ClickTarget {
  return createClickTarget({
    selection: selection ? { text: selection, type: "non-editable", start: 0, end: selection.length } : null,
    payloadKinds: ["rows"],
    auth: { authenticated: true },
  });
}

function eligibilityOf(n: DNode): Exclude<Eligibility, { status: "absent" }> {
  return n.viewerReason ? { status: "unavailable", sentence: n.viewerReason } : { status: "available" };
}

function toAction(n: DNode, category: ActionCategory, order: number, onRun: RunHandler, inStrip: boolean, section?: { id: string; label: string }): Action {
  const children = n.children;
  return {
    id: n.id,
    label: n.label,
    category,
    order,
    ...(n.icon ? { icon: n.icon } : {}),
    ...(n.hint ? { hint: n.hint } : {}),
    ...(n.destructive ? { destructive: true } : {}),
    ...(n.destructive && inStrip ? { iconTone: "text-destructive" } : {}),
    ...(n.startsGroup ? { startsGroup: true } : {}),
    ...(section ? { section } : {}),
    eligible: () => eligibilityOf(n),
    ...(children
      ? { expand: async () => children.map((c, i) => toAction(c, category, i, onRun, false)) }
      : {}),
    run: () => onRun(n.label),
  };
}

/** The spec's top-level rows as registry Actions (the provider's answer). */
export function specActions(spec: DesignSpec, onRun: RunHandler): Action[] {
  const out: Action[] = spec.strip.map((n, i) => toAction(n, "clipboard", i, onRun, true));
  spec.sections.forEach((s, si) => {
    const category = SECTION_CATEGORIES[si] ?? "surface-info";
    const section = s.heading ? { id: `section-${si}`, label: s.heading } : undefined;
    s.nodes.forEach((n, i) => out.push(toAction(n, category, i, onRun, false, section)));
  });
  return out;
}

/** Can the package's own ContextMenuPanel draw this spec exactly? */
export function packageCanDraw(spec: DesignSpec): boolean {
  if (spec.stripAfter > 0) return false;
  // The package engine marks every submenu row available; a greyed row inside a submenu needs the demo layout.
  const nestedGrey = (nodes: readonly DNode[]): boolean => nodes.some((n) => (n.children ?? []).some((c) => c.viewerReason || nestedGrey([c])));
  return !spec.sections.some((s) => nestedGrey(s.nodes));
}

/** The full MenuModel: `buildMenuModel` over the resolved rows, every submenu filled the way the engine fills it. */
export function fullModel(spec: DesignSpec, onRun: RunHandler): { model: MenuModel; target: ClickTarget } {
  const target = demoTarget(spec.header.label === "Selected" ? spec.header.text : null);
  const actions = specActions(spec, onRun);
  const resolved: ResolvedAction[] = actions.map((action) => ({ action, eligibility: action.eligible(target) as ResolvedAction["eligibility"] }));
  const named = spec.header.label !== "Selected";
  let model = buildMenuModel(target, resolved, {
    headingPolicy: "inline",
    ...(named ? { contentLabel: spec.header.label, content: spec.header.text } : {}),
  });
  const byId = new Map<string, DNode>();
  const index = (nodes: readonly DNode[]) => nodes.forEach((n) => (byId.set(n.id, n), n.children && index(n.children)));
  index(spec.strip);
  spec.sections.forEach((s) => index(s.nodes));
  const fill = (id: string) => {
    const children = byId.get(id)?.children ?? [];
    const nodes: MenuNode[] = [];
    children.forEach((c, i) => {
      if (i > 0 && c.startsGroup) nodes.push({ kind: "separator", id: `${c.id}:group` });
      nodes.push(actionToNode({ action: toAction(c, "edit", i, onRun, false), eligibility: eligibilityOf(c) }, target));
    });
    model = withExpandedChildren(model, id, nodes);
    for (const c of children) if (c.children) fill(c.id);
  };
  for (const [id, n] of byId) if (n.children && actions.some((a) => a.id === id)) fill(id);
  return { model, target };
}

// ── The demo-local layout: the package's tiered strip, drawn after N sections ──

export interface DesignArranged {
  before: MenuSection[];
  strip: MenuLeafNode[];
  after: MenuSection[];
}

const isLeaf = (n: MenuNode): n is MenuLeafNode => n.kind === "item" || n.kind === "checkbox" || n.kind === "link";

export function designContext(model: MenuModel, stripAfter: number): DesignArranged {
  const clipboard = model.sections.find((s) => s.group === "clipboard");
  const rest = model.sections.filter((s) => s.group !== "clipboard");
  return { before: rest.slice(0, stripAfter), strip: clipboard ? clipboard.nodes.filter(isLeaf) : [], after: rest.slice(stripAfter) };
}

// ── Counts, walked from the model ─────────────────────────────────────────────

export interface DesignMetrics {
  topRows: number;
  stripIcons: number;
  /** Clicks after the menu opens; null when the menu has no Archive. */
  clicksToArchive: number | null;
  reachable: number;
  total: number;
  lossless: boolean;
  missing: string[];
}

function rows(nodes: readonly MenuNode[]): MenuNode[] {
  return nodes.filter((n) => n.kind !== "separator" && n.kind !== "label");
}

export function measure(model: MenuModel): DesignMetrics {
  const ids = new Set<string>();
  let archiveDepth: number | null = null;
  const walk = (nodes: readonly MenuNode[], depth: number) => {
    for (const n of rows(nodes)) {
      ids.add(n.id);
      if (n.id === "archive" && (archiveDepth === null || depth < archiveDepth)) archiveDepth = depth;
      if (n.kind === "submenu") walk(n.children, depth + 1);
    }
  };
  for (const s of model.sections) walk(s.nodes, 1);
  const top = model.sections.filter((s) => s.group !== "clipboard").flatMap((s) => rows(s.nodes));
  const strip = model.sections.filter((s) => s.group === "clipboard").flatMap((s) => rows(s.nodes));
  const reachable = TODAY_ROW_IDS.filter((id) => ids.has(id)).length;
  const missing = TODAY_ALL_GENERIC_IDS.filter((id) => !ids.has(id));
  return {
    topRows: top.length,
    stripIcons: strip.length,
    clicksToArchive: archiveDepth,
    reachable,
    total: TODAY_ROW_IDS.length,
    lossless: missing.length === 0,
    missing,
  };
}
