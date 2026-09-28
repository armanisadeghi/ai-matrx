// features/context-menu-v3/regroup/grouping.ts
//
// A GROUPING is a proposed arrangement of the ONE right-click menu, applied to
// the resolved registry actions (never a hand-written list): each resolved
// action goes to the top level, first (the page's own rows), or into one named
// submenu. It exists so Arman can compare the current menu with a regrouped one
// side by side before anything changes in production (2026-09-27: "I'm not
// happy with what we have but I also don't want things done blindly and I'm
// not willing to lose important features").
//
// NOTHING IS LOST SILENTLY. `regroupResolved` returns where every input action
// ended up, and `auditRegroup` recomputes that from the OUTPUT (the actions the
// regrouped menu actually holds, submenu members included) — so an action the
// regroup dropped by mistake is reported as having no new home, never hidden.
//
// Pure: no React. Applied only where a `MenuRegroupContext` asks for it
// (`RegroupContext.tsx`); production menus carry no grouping.

import type { Action, ActionCategory, ClickTarget, ResolvedAction } from "@ai-matrx/alchemy/actions";
import {
  buildMenuModel,
  context as arrangeContext,
  type ContextArrangement,
  type MenuModel,
  type MenuNode,
} from "@ai-matrx/alchemy/menu";

/** One submenu the grouping creates. The label is a plain, conventional word. */
export interface MenuGroupDef {
  key: string;
  label: string;
  /** One line: what the person gets from a row in this submenu. */
  definition: string;
  /** Icon KEY for the Alchemy icon port. */
  icon?: string;
  /** Decides where the submenu row sits among the other rows (the package's group order). */
  category: ActionCategory;
  order: number;
}

export type GroupingDestination =
  /** Top level, lifted to the very top: the page's own actions. */
  | { kind: "page-first" }
  /** Top level, where the package places it (verbs stay in the icon strip). */
  | { kind: "top" }
  | { kind: "group"; key: string };

export interface GroupingRule {
  /** Matches when ANY listed condition matches. */
  when: {
    ids?: readonly string[];
    idPrefixes?: readonly string[];
    categories?: readonly ActionCategory[];
    /** The clicked thing's own section (a row's or a note's actions). */
    pageOwn?: boolean;
    /**
     * A page's OWN row whose label matches one of these (case-insensitive
     * regular expressions): a record action that duplicates a category
     * ("Export as Markdown", "Share link…") moves into that category.
     */
    pageOwnLabels?: readonly string[];
  };
  to: GroupingDestination;
  /**
   * Universal rows that do the same thing. When one of them is in the menu,
   * the matched row merges into it (one row, recorded as merged) instead of
   * sitting beside it.
   */
  mergeWithIds?: readonly string[];
}

export interface MenuGrouping {
  name: string;
  groups: readonly MenuGroupDef[];
  /** First match wins. */
  rules: readonly GroupingRule[];
  /** Where an action no rule names goes. */
  fallback: GroupingDestination;
  /** A group with fewer members than this is not made: its member stays at the top level. */
  minMembers: number;
}

export interface RegroupOptions {
  /** Inside one submenu, a second row with the same name as an earlier one is merged into it. */
  mergeSameName: boolean;
}

/** Why an action sits where it sits in the proposed menu. */
export type ProposedHome =
  | { kind: "page-first" }
  | { kind: "top"; note?: string }
  | { kind: "group"; key: string; label: string }
  | { kind: "merged"; intoId: string; intoLabel: string; groupLabel: string };

export interface RegroupResult {
  /** What the proposed menu resolves: top-level actions plus one submenu action per group. */
  resolved: ResolvedAction[];
  /** The rows inside each submenu, by group key, in order. */
  members: Map<string, ResolvedAction[]>;
  home: Map<string, ProposedHome>;
}

export const REGROUP_ID_PREFIX = "regroup:";

export function actionLabel(action: Action, target: ClickTarget): string {
  try {
    return typeof action.label === "function" ? action.label(target) : action.label;
  } catch {
    return action.id;
  }
}

function isPageOwn(action: Action): boolean {
  const section = action.section as (Action["section"] & { kind?: string; primary?: boolean }) | undefined;
  return Boolean(section && (section.primary || section.kind === "target"));
}

function labelOf(action: Pick<Action, "id" | "label">, target?: ClickTarget): string {
  if (typeof action.label === "string") return action.label;
  return target ? actionLabel(action as Action, target) : "";
}

function ruleMatches(rule: GroupingRule, action: Action, target?: ClickTarget): boolean {
  const w = rule.when;
  if (w.pageOwnLabels && isPageOwn(action)) {
    const label = labelOf(action, target);
    if (label && w.pageOwnLabels.some((p) => new RegExp(p, "i").test(label))) return true;
  }
  if (w.ids?.includes(action.id)) return true;
  if (w.idPrefixes?.some((p) => action.id.startsWith(p))) return true;
  if (w.categories?.includes(action.category)) return true;
  if (w.pageOwn && isPageOwn(action)) return true;
  return false;
}

/** The rule that places this action, or null when it falls through to `fallback`. */
export function matchRule(
  grouping: MenuGrouping,
  action: Pick<Action, "id" | "category" | "section"> & { label?: Action["label"] },
  target?: ClickTarget,
): GroupingRule | null {
  return grouping.rules.find((r) => ruleMatches(r, action as Action, target)) ?? null;
}

export function destinationFor(grouping: MenuGrouping, action: Action, target?: ClickTarget): GroupingDestination {
  return matchRule(grouping, action, target)?.to ?? grouping.fallback;
}

const sameName = (label: string) =>
  label
    .toLowerCase()
    .replace(/[….]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every node id in a model, in drawn order (for keeping familiar order inside a submenu). */
function drawnOrder(model: MenuModel): Map<string, number> {
  const order = new Map<string, number>();
  const walk = (nodes: readonly MenuNode[]) => {
    for (const n of nodes) {
      if (!order.has(n.id)) order.set(n.id, order.size);
      if (n.kind === "submenu") walk(n.children);
    }
  };
  for (const s of model.sections) walk(s.nodes);
  return order;
}

export function currentModel(target: ClickTarget, resolved: readonly ResolvedAction[]): MenuModel {
  return buildMenuModel(target, resolved, { headingPolicy: "inline" });
}

/**
 * Apply a grouping to the resolved actions. Actions greyed with a reason stay
 * at the top level: a submenu row is always drawn runnable, so moving a greyed
 * row into one would make it look usable when it is not.
 */
export function regroupResolved(
  target: ClickTarget,
  resolved: readonly ResolvedAction[],
  grouping: MenuGrouping,
  options: RegroupOptions,
): RegroupResult {
  const order = drawnOrder(currentModel(target, resolved));
  const pos = (r: ResolvedAction) => order.get(r.action.id) ?? Number.MAX_SAFE_INTEGER;
  const groupDef = new Map(grouping.groups.map((g) => [g.key, g]));

  const top: ResolvedAction[] = [];
  const home = new Map<string, ProposedHome>();
  const wanted = new Map<string, ResolvedAction[]>();

  // Equivalent rows: a matched row whose universal twin is in this menu merges into it.
  const present = new Map(resolved.map((r) => [r.action.id, r]));
  const twinOf = (r: ResolvedAction): ResolvedAction | null => {
    const rule = matchRule(grouping, r.action, target);
    for (const id of rule?.mergeWithIds ?? []) {
      const twin = present.get(id);
      if (twin && twin !== r) return twin;
    }
    return null;
  };
  const mergedInto = new Map<string, ResolvedAction>();

  for (const r of resolved) {
    const twin = twinOf(r);
    if (twin) {
      mergedInto.set(r.action.id, twin);
      continue;
    }
    const to = destinationFor(grouping, r.action, target);
    if (to.kind === "group" && groupDef.has(to.key)) {
      if (r.eligibility.status !== "available") {
        top.push(r);
        home.set(r.action.id, { kind: "top", note: "greyed here, so it stays visible with its reason" });
        continue;
      }
      const list = wanted.get(to.key) ?? [];
      list.push(r);
      wanted.set(to.key, list);
      continue;
    }
    if (to.kind === "page-first") {
      const section = r.action.section;
      top.push(
        section
          ? { ...r, action: { ...r.action, section: { ...section, primary: true } } as Action }
          : r,
      );
      home.set(r.action.id, { kind: "page-first" });
      continue;
    }
    top.push(r);
    home.set(r.action.id, { kind: "top" });
  }

  const members = new Map<string, ResolvedAction[]>();
  const groupActions: ResolvedAction[] = [];
  for (const def of grouping.groups) {
    const list = (wanted.get(def.key) ?? []).slice().sort((a, b) => pos(a) - pos(b));
    if (list.length === 0) continue;
    if (list.length < grouping.minMembers) {
      for (const r of list) {
        top.push(r);
        home.set(r.action.id, { kind: "top", note: `the only row for ${def.label}` });
      }
      continue;
    }
    const kept: ResolvedAction[] = [];
    const byName = new Map<string, ResolvedAction>();
    for (const r of list) {
      const name = sameName(actionLabel(r.action, target));
      const first = options.mergeSameName ? byName.get(name) : undefined;
      if (first) {
        home.set(r.action.id, {
          kind: "merged",
          intoId: first.action.id,
          intoLabel: actionLabel(first.action, target),
          groupLabel: def.label,
        });
        continue;
      }
      byName.set(name, r);
      kept.push(r);
      home.set(r.action.id, { kind: "group", key: def.key, label: def.label });
    }
    members.set(def.key, kept);
    const children = kept.map((r) => r.action);
    const submenu: Action = {
      id: `${REGROUP_ID_PREFIX}${def.key}`,
      label: def.label,
      category: def.category,
      order: def.order,
      ...(def.icon ? { icon: def.icon } : {}),
      // Still loading at the source when any member is.
      pending: (t) => children.some((c) => Boolean(c.expand && c.pending?.(t))),
      eligible: () => ({ status: "available" }),
      expand: async () => children,
      run: () => undefined,
    };
    groupActions.push({ action: submenu, eligibility: { status: "available" } });
  }

  // Where each twin ended up names where the merged row now lives.
  for (const [id, twin] of mergedInto) {
    const at = home.get(twin.action.id);
    home.set(id, {
      kind: "merged",
      intoId: twin.action.id,
      intoLabel: actionLabel(twin.action, target),
      groupLabel: at?.kind === "group" ? at.label : at?.kind === "merged" ? at.groupLabel : "",
    });
  }

  return { resolved: [...top, ...groupActions], members, home };
}

// ── Where a row is drawn (for the "what goes where" table) ─────────────────

/** Where each top-level action id is drawn in a context arrangement. */
export function drawnPlaces(model: MenuModel, arrangement: ContextArrangement): Map<string, string> {
  const arranged = arrangeContext(model, arrangement);
  const places = new Map<string, string>();
  for (const leaf of arranged.strip) places.set(leaf.actionId ?? leaf.id, "Icon strip");
  arranged.sections.forEach((section, index) => {
    const heading = section.label ? `"${section.label}" section` : "";
    for (const node of section.nodes) {
      if (node.kind === "separator" || node.kind === "label") continue;
      if (node.kind === "submenu" && node.id.endsWith(":fold")) {
        for (const child of node.children) {
          if (child.kind === "separator" || child.kind === "label") continue;
          places.set(child.actionId ?? child.id, `${node.label} ▸`);
        }
        continue;
      }
      places.set(node.actionId ?? node.id, heading ? `Top level · ${heading}` : index === 0 && section.primary ? "Top level · first" : "Top level");
    }
  });
  return places;
}

/** How many rows a person sees when the menu opens (strip icons count as one row). */
export function topLevelRowCount(model: MenuModel, arrangement: ContextArrangement): number {
  const arranged = arrangeContext(model, arrangement);
  let rows = arranged.strip.length > 0 ? 1 : 0;
  for (const section of arranged.sections) {
    rows += section.nodes.filter((n) => n.kind !== "separator" && n.kind !== "label").length;
  }
  return rows;
}

export interface AuditRow {
  id: string;
  label: string;
  category: ActionCategory;
  isSubmenu: boolean;
  /** The clicked thing's own row (surface-specific), not a universal one. */
  pageOwn: boolean;
  current: string;
  proposed: ProposedHome | null;
  proposedPlace: string;
}

export interface RegroupAudit {
  rows: AuditRow[];
  /** Current actions the regrouped menu does not hold anywhere and does not explain. */
  lost: AuditRow[];
  currentRows: number;
  proposedRows: number;
}

/**
 * Recompute, from what the regrouped menu HOLDS, where every current action
 * went. An action counts as placed only if it is a top-level action of the
 * regrouped menu, a member of one of its submenus, or recorded as merged into
 * a row that is itself placed.
 */
export function auditRegroup(
  target: ClickTarget,
  resolved: readonly ResolvedAction[],
  grouping: MenuGrouping,
  options: RegroupOptions,
  arrangement: ContextArrangement,
  /** The regroup under audit (tests hand in a broken one to prove the guard fires). */
  regroup: typeof regroupResolved = regroupResolved,
): RegroupAudit {
  const result = regroup(target, resolved, grouping, options);
  const current = currentModel(target, resolved);
  const proposed = currentModel(target, result.resolved);
  const currentPlaces = drawnPlaces(current, arrangement);
  const proposedPlaces = drawnPlaces(proposed, arrangement);

  const held = new Set<string>();
  for (const r of result.resolved) if (!r.action.id.startsWith(REGROUP_ID_PREFIX)) held.add(r.action.id);
  for (const list of result.members.values()) for (const r of list) held.add(r.action.id);

  const rows: AuditRow[] = resolved.map((r) => {
    const home = result.home.get(r.action.id) ?? null;
    let proposedPlace = "";
    if (held.has(r.action.id)) {
      proposedPlace =
        home?.kind === "group" ? `${home.label} ▸` : (proposedPlaces.get(r.action.id) ?? "Top level");
    } else if (home?.kind === "merged" && held.has(home.intoId)) {
      proposedPlace = home.groupLabel ? `${home.groupLabel} ▸ ${home.intoLabel}` : `Top level · ${home.intoLabel}`;
    }
    return {
      id: r.action.id,
      label: actionLabel(r.action, target),
      category: r.action.category,
      isSubmenu: Boolean(r.action.expand),
      pageOwn: isPageOwn(r.action),
      current: currentPlaces.get(r.action.id) ?? "Top level",
      proposed: proposedPlace ? home : null,
      proposedPlace,
    };
  });

  return {
    rows,
    lost: rows.filter((row) => !row.proposedPlace),
    currentRows: topLevelRowCount(current, arrangement),
    proposedRows: topLevelRowCount(proposed, arrangement),
  };
}
