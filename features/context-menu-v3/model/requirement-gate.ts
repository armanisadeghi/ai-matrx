// features/context-menu-v3/model/requirement-gate.ts
//
// THE DERIVED GATE — why an item is in this menu at all.
//
// 🚨 THE LAW (THE-MODEL.md law 3, "Availability = capability"; Arman,
// INTERVIEW Rounds 8 + 11):
//
//   "They show up when their requirements are met, and are hidden when not.
//    No text selected → nothing to translate → no translate option."
//   "It's not about the value existing but that the KEY exists — if a surface
//    has a read or a write path for code, it counts as having code, so the
//    portable option shows."
//   "Categories group and curate; they do not gate. A place may explicitly
//    exclude."
//
// WHAT THIS REPLACES. Until Phase 6.7 the menu decided visibility with two
// unrelated mechanisms glued together: 16 hardcoded feature slugs
// (`enabled_features`, EMPTY on 168 of 207 rows, so "untagged → general → show
// everywhere") OR an exact `surface_name` string match — and anything that
// only qualified via the first path was rendered RED as a `legacyMatch`,
// i.e. the menu shipped its own backlog to the user. Both are gone. An item
// now either QUALIFIES or is ABSENT; nothing renders as a broken row.
//
// THE THREE RULES, in the order they run:
//
//   1. REQUIREMENTS (the gate). Every surface value an item consumes must
//      have a read path here. Key-existence, never value-population: a
//      surface that DECLARES `raw_transcript_text` offers the transcript
//      items even before the user has recorded anything.
//   2. SCOPE (the authored hierarchy). global → domain → surface, inherited
//      downward. An item may narrow where it is offered; it can never widen
//      past rule 1.
//   3. EXCLUSION (the valve). A surface may explicitly refuse an item that
//      rules 1+2 offered. The ONE sanctioned override.
//
// Categories are not consulted anywhere in this file. They group; the
// placement submenu a category sits under is LAYOUT (see menu-model.ts).
//
// This module is pure and dependency-free so both the hook and the tests use
// exactly the same code the menu runs.

import type { ValueMappingMap } from "@/features/surfaces/types";

/* -------------------------------------------------------------------------- */
/* 1. REQUIREMENTS — what an item consumes                                    */
/* -------------------------------------------------------------------------- */

/**
 * The shape the gate needs from an item. Deliberately structural, not an
 * `AgentShortcutRecord`: with `SHORTCUT_STORAGE_CUTOVER` ON the same rows
 * arrive from `mandate.vw_shortcut` (identical columns, same ids) and with it
 * OFF from `agent.shortcut`. The gate consumes the SEAM, never a table.
 */
export interface GateableItem {
  id: string;
  /** Canonical DSL: agent-side key → mapping naming the surface value. */
  valueMappings?: ValueMappingMap | null;
  /** Legacy inverse map: surface value name → agent variable. */
  scopeMappings?: Record<string, string> | null;
  /** Legacy inverse map: surface value name → context policy. */
  contextMappings?: Record<string, string> | null;
  /**
   * The authored scope rung (see §2). `null` = global. A `<client>/<surface>`
   * value pins to that page; a `<client>` or `<client>/*` value pins to the
   * whole domain.
   */
  surfaceName?: string | null;
}

/**
 * The surface value names an item needs a read path for.
 *
 * Sources, all three promoted into one canonical set:
 *  - `valueMappings` entries whose `mapType` is `surface_value` — the
 *    `target` IS the surface value name;
 *  - `scopeMappings` / `contextMappings` KEYS — those legacy columns run in
 *    the inverse direction (surface key → agent target), so the key is the
 *    surface value.
 *
 * NOT requirements: `direct_value` (a literal the author typed),
 * `prompt_user` (the user supplies it at launch — that is the designed
 * answer to a missing value, not a reason to hide), and `unmapped`.
 * An empty `target` is a half-authored row, not a requirement — 3 live rows
 * carry `{"mapType":"surface_value","target":""}` and hiding them everywhere
 * would be the gate lying about an authoring bug.
 */
export function requirementsOf(item: GateableItem): string[] {
  const out = new Set<string>();
  for (const [key, mapping] of Object.entries(item.valueMappings ?? {})) {
    // Reserved sibling keys inside the same JSONB blob (see converters.ts).
    if (key.startsWith("__")) continue;
    if (!mapping || typeof mapping !== "object") continue;
    if (mapping.mapType !== "surface_value") continue;
    const target = typeof mapping.target === "string" ? mapping.target : "";
    if (target.trim()) out.add(target);
  }
  for (const legacy of [item.scopeMappings, item.contextMappings]) {
    for (const [surfaceValueName, agentTarget] of Object.entries(legacy ?? {})) {
      if (typeof agentTarget !== "string" || !agentTarget.trim()) continue;
      if (surfaceValueName.trim()) out.add(surfaceValueName);
    }
  }
  return [...out];
}

/* -------------------------------------------------------------------------- */
/* 2. SCOPE — the authored hierarchy (Arman's design)                         */
/* -------------------------------------------------------------------------- */

export type MenuScopeLevel = "global" | "domain" | "surface";

export interface MenuScope {
  level: MenuScopeLevel;
  /** The domain (first path segment) for `domain` and `surface` rungs. */
  domain: string | null;
  /** The exact `ui_surface.name` for the `surface` rung. */
  surface: string | null;
}

export const GLOBAL_SCOPE: MenuScope = {
  level: "global",
  domain: null,
  surface: null,
};

/**
 * THE DOMAIN DERIVATION — stated plainly because it is a convention, not a
 * table.
 *
 * Every registered surface is named `<client>/<surface>`
 * (`matrx-user/notes`, `matrx-admin/database`, `matrx-default/default`,
 * `matrx-public/p`). The FIRST PATH SEGMENT is the domain — it is already the
 * `ui_surface.client_name` column and already how the registry groups
 * surfaces for humans. So the middle rung of the hierarchy needs no new
 * vocabulary: it is that segment.
 */
export function domainOfSurfaceName(
  surfaceName: string | null | undefined,
): string | null {
  if (!surfaceName) return null;
  const head = surfaceName.split("/")[0]?.trim();
  return head ? head : null;
}

/**
 * THE STORAGE DECISION — one column carries all three rungs.
 *
 * `surface_name` survives "ONLY as the page-level rung of the hierarchy", and
 * the rungs above it are the same string with less of it:
 *
 *     null   /  ""  /  "*"          → GLOBAL   (offered wherever it qualifies)
 *     "matrx-user"  /  "matrx-user/*" → DOMAIN (that whole feature area)
 *     "matrx-user/notes"            → SURFACE  (exactly that page)
 *
 * WHY NOT a new reserved key in `value_mappings` (the `__write_policies`
 * pattern): that blob is parsed by `parseValueMappings`, which returns NULL
 * for any object that is not a clean `ValueMappingMap` — a stray sibling key
 * silently deletes every mapping on the row, and the one-sided-patch hazard
 * the converters already scream about would grow a third side. The column we
 * were told to keep already means "where does this belong", it is byte-
 * identical on `agent.shortcut` and `mandate.vw_shortcut` (so BOTH switch
 * positions inherit this for free), and it needs no DDL and no migration:
 * all 146 surface-pinned rows keep their exact behaviour, and all 62 null
 * rows are already global.
 */
export function readMenuScope(item: GateableItem): MenuScope {
  const raw = (item.surfaceName ?? "").trim();
  if (!raw || raw === "*") return GLOBAL_SCOPE;

  const [head, ...rest] = raw.split("/");
  const domain = head?.trim() || null;
  if (!domain) return GLOBAL_SCOPE;

  const tail = rest.join("/").trim();
  // "matrx-user" (no slash) and "matrx-user/*" both mean the whole domain.
  if (rest.length === 0 || tail === "*" || tail === "") {
    return { level: "domain", domain, surface: null };
  }
  return { level: "surface", domain, surface: raw };
}

/** Canonical authored value for a rung — what an editor should persist. */
export function writeMenuScope(scope: MenuScope): string | null {
  if (scope.level === "global") return null;
  if (scope.level === "domain") return scope.domain ? `${scope.domain}/*` : null;
  return scope.surface ?? null;
}

/**
 * Does an item's authored scope reach this surface? Inheritance is downward:
 * global reaches every surface, a domain reaches every surface in it, a
 * surface reaches only itself.
 *
 * On a surface we cannot name (an unregistered page with no `surfaceName`),
 * only GLOBAL items reach — a domain- or page-pinned item must not leak onto
 * a page the platform cannot identify.
 */
export function scopeReaches(
  scope: MenuScope,
  surfaceName: string | null | undefined,
): boolean {
  if (scope.level === "global") return true;
  if (!surfaceName) return false;
  if (scope.level === "domain")
    return domainOfSurfaceName(surfaceName) === scope.domain;
  return scope.surface === surfaceName;
}

/* -------------------------------------------------------------------------- */
/* 3. AVAILABLE KEYS — what this surface can read                             */
/* -------------------------------------------------------------------------- */

export interface AvailableKeysArgs {
  /** Value names the surface manifest DECLARES (inheritance already merged). */
  declaredValueNames?: readonly string[];
  /**
   * Keys actually present on the resolved `ApplicationScope` at open time.
   * These cover surfaces that emit values without declaring them ("Undeclared
   * (runtime only)" in the Surface Context window) — a real read path is a
   * read path whether or not anyone wrote it down.
   */
  runtimeScopeKeys?: readonly string[];
  /** The 5 empty-floored generic values every menu always resolves. */
  baselineValueNames: readonly string[];
}

/**
 * The set of surface value names that have a read path here.
 *
 * KEY-EXISTENCE, NOT VALUE-POPULATION. `runtimeScopeKeys` is the list of keys
 * the scope CARRIES, including the ones floored to `""` — an empty selection
 * still counts as "this surface can read a selection". The one population
 * check the menu keeps lives in the hook, not here (see `SELECTION_KEYS`).
 */
export function buildAvailableKeys(args: AvailableKeysArgs): Set<string> {
  const out = new Set<string>(args.baselineValueNames);
  for (const name of args.declaredValueNames ?? []) out.add(name);
  for (const name of args.runtimeScopeKeys ?? []) out.add(name);
  return out;
}

/* -------------------------------------------------------------------------- */
/* The decision                                                               */
/* -------------------------------------------------------------------------- */

export type OfferRefusal =
  | { kind: "missing_keys"; missing: string[] }
  | { kind: "out_of_scope"; scope: MenuScope }
  | { kind: "excluded" };

export type OfferDecision =
  | { offered: true }
  | { offered: false; refusal: OfferRefusal };

export interface OfferContext {
  /** The `ui_surface.name` this menu is mounted on, when it has one. */
  surfaceName: string | null;
  /** From `buildAvailableKeys`. */
  availableKeys: ReadonlySet<string>;
  /** The surface's exclusion valve (`menu` config namespace). */
  excludedItemIds?: ReadonlySet<string>;
}

/**
 * THE GATE. Requirements first (the rule), scope second (the authoring), the
 * valve last (the override). Returns WHY on a refusal so the dev-mode
 * diagnostics can name it — a hidden item with no explanation is how the old
 * red rows were born.
 */
export function decideOffer(
  item: GateableItem,
  ctx: OfferContext,
): OfferDecision {
  const missing = requirementsOf(item).filter(
    (key) => !ctx.availableKeys.has(key),
  );
  if (missing.length > 0) return { offered: false, refusal: { kind: "missing_keys", missing } };

  const scope = readMenuScope(item);
  if (!scopeReaches(scope, ctx.surfaceName))
    return { offered: false, refusal: { kind: "out_of_scope", scope } };

  if (ctx.excludedItemIds?.has(item.id))
    return { offered: false, refusal: { kind: "excluded" } };

  return { offered: true };
}
