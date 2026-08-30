/**
 * THE SHORTCUT STORAGE ROUTER — the one place this repo names shortcut storage.
 *
 * Phase 6.6 of the workflow-mandate program migrated every `agent.shortcut`
 * row into the mandate schema (a shortcut IS a discovered mandate + a
 * widget-tier treatment + a pin binding — THE-MODEL.md), while R14 keeps
 * every existing shortcut UI working unchanged. The bridge is DB-side:
 *
 *     agent.shortcut            ->  mandate.vw_shortcut       (updatable view,
 *                                   exact same column shape, SAME ids)
 *     agent.context_menu_view   ->  mandate.context_menu_view (mechanical twin)
 *     agx_* shortcut RPCs       ->  agx_*_m mirrors           (generated from
 *                                   the live originals at migration apply time)
 *
 * Every shortcut `.schema(...).from(...)` and every shortcut RPC name goes
 * through the helpers here, so the flip is ONE constant instead of a sweep
 * across 10 files. Cross-repo design:
 * `/common-docs/projects/workflow-mandate-program/DESIGN-unification.md` §4/§5;
 * migration + parity: `aidream/scripts/migrate_shortcuts_to_mandates.py`.
 *
 * ┌─ THE SWITCH ──────────────────────────────────────────────────────────────┐
 * │  SHORTCUT_STORAGE_CUTOVER = false   agent.shortcut (the live serving path)│
 * │  SHORTCUT_STORAGE_CUTOVER = true    mandate.* through the compat surface  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * WHY A CONSTANT AND NOT AN ENV VAR: the same scar `mandateStorage.ts`
 * documents (`/common-docs/policies/env-vars-are-values-not-toggles.md`).
 * The flip is a one-line release after Arman's nod — see the FLIP-NOTE in
 * `/common-docs/projects/workflow-mandate-program/PLAN.md`.
 *
 * WHY BOTH BRANCHES TYPE-CHECK: `SHORTCUT_STORAGE_CUTOVER` is a literal, so
 * TypeScript narrows every export below to the ACTIVE branch — with the
 * switch OFF the row/RPC types are byte-identical to what the call sites had
 * before this module existed — while the INACTIVE branch stays compiled,
 * real code (the mandateStorage.ts pattern).
 *
 * Writes with the switch ON land in mandate.definition / mandate.treatment /
 * mandate.binding via the view's INSTEAD OF trigger — the client never
 * decomposes a shortcut itself, so there is exactly one writer shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/** OFF — ships dark. The flip is a one-line release (R14 gate: Arman's nod). */
export const SHORTCUT_STORAGE_CUTOVER = true;

type Client = SupabaseClient<Database>;

/** Human-readable name of the ACTIVE storage, for error copy and logs. */
export const SHORTCUT_STORAGE_LABEL = SHORTCUT_STORAGE_CUTOVER
  ? "mandate.vw_shortcut"
  : "agent.shortcut";

/* -------------------------------------------------------------------------- */
/* Table + view accessors — the ONLY place either schema is named.            */
/* -------------------------------------------------------------------------- */

const agentShortcutTable = (supabase: Client) => supabase.schema("agent").from("shortcut");

/*
 * The compat view CARRIES agent.shortcut's exact contract — same columns,
 * same NOT NULL semantics (COALESCEd in the view), writable via INSTEAD OF
 * triggers, proven byte-identical for all 208 rows by the migration's parity
 * assert. The type generator cannot see any of that (views come out
 * all-nullable with `never` writes), so the builder is cast to the contract
 * the view actually honors. The two extra columns (mandate_id, mandate_key)
 * are reached through the accessors below, never through this type.
 */
const mandateShortcutTable = (supabase: Client) =>
  supabase
    .schema("mandate")
    .from("vw_shortcut") as unknown as ReturnType<typeof agentShortcutTable>;

/** The shortcut table: `agent.shortcut` or `mandate.vw_shortcut`. */
export const shortcutTable = (
  SHORTCUT_STORAGE_CUTOVER ? mandateShortcutTable : agentShortcutTable
) as typeof SHORTCUT_STORAGE_CUTOVER extends true
  ? typeof mandateShortcutTable
  : typeof agentShortcutTable;

const agentContextMenuView = (supabase: Client) =>
  supabase.schema("agent").from("context_menu_view");
const mandateContextMenuView = (supabase: Client) =>
  supabase.schema("mandate").from("context_menu_view");

/** The unified context-menu view: `agent.` or `mandate.context_menu_view`. */
export const contextMenuView = (
  SHORTCUT_STORAGE_CUTOVER ? mandateContextMenuView : agentContextMenuView
) as typeof SHORTCUT_STORAGE_CUTOVER extends true
  ? typeof mandateContextMenuView
  : typeof agentContextMenuView;

/* -------------------------------------------------------------------------- */
/* RPC names — mirrors carry identical signatures and row shapes.             */
/* -------------------------------------------------------------------------- */

const AGENT_RPCS = {
  buildMenu: "agx_build_shortcut_menu",
  forContext: "agx_get_shortcuts_for_context",
  userShortcuts: "agx_get_user_shortcuts",
  duplicate: "agx_duplicate_shortcut",
  promoteToGlobal: "agx_promote_shortcut_to_global",
  create: "agx_create_shortcut",
  listNonGlobalForAdmin: "agx_list_non_global_shortcuts_for_admin",
} as const;

const MANDATE_RPCS = {
  buildMenu: "agx_build_shortcut_menu_m",
  forContext: "agx_get_shortcuts_for_context_m",
  userShortcuts: "agx_get_user_shortcuts_m",
  duplicate: "agx_duplicate_shortcut_m",
  promoteToGlobal: "agx_promote_shortcut_to_global_m",
  create: "agx_create_shortcut_m",
  listNonGlobalForAdmin: "agx_list_non_global_shortcuts_for_admin_m",
} as const;

/** The shortcut RPC names on the ACTIVE storage. */
export const SHORTCUT_RPCS = (
  SHORTCUT_STORAGE_CUTOVER ? MANDATE_RPCS : AGENT_RPCS
) as typeof SHORTCUT_STORAGE_CUTOVER extends true ? typeof MANDATE_RPCS : typeof AGENT_RPCS;

/* -------------------------------------------------------------------------- */
/* Forward reference — the mandate behind a shortcut, when ON.                */
/* -------------------------------------------------------------------------- */

/**
 * A row read from the ACTIVE shortcut storage (full row or projection).
 * With the switch ON, `mandate.vw_shortcut` rows additionally carry
 * `mandate_id` + `mandate_key`; with it OFF those columns do not exist.
 */
export type ShortcutRowLike = Readonly<Record<string, unknown>>;

/** The mandate id behind a shortcut row — `null` before the cutover. */
export function mandateIdOfShortcutRow(row: ShortcutRowLike): string | null {
  if (!SHORTCUT_STORAGE_CUTOVER) return null;
  return ((row as Record<string, unknown>).mandate_id as string | null) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Write policies — treatment on the mandate side, blob-nested on the old one. */
/* -------------------------------------------------------------------------- */

/**
 * WHERE A SHORTCUT'S WRITE POLICIES LIVE on the ACTIVE storage.
 *
 * OFF — `agent.shortcut` has no home for them, so they ride inside the
 * `value_mappings` JSONB under the reserved `__write_policies` key (the
 * converters are the ONE serializer pair for that shape).
 *
 * ON — a write policy is TREATMENT, not consumption (THE-MODEL law 4), so it
 * lives at `mandate.treatment.config.write_policies` and the compat view
 * exposes it as its own `write_policies` column, writable through the same
 * INSTEAD OF trigger. `value_mappings` then carries consumption ONLY and the
 * two halves stop sharing a column.
 * Migration: `migrations/mandate_shortcut_write_policies_on_treatment.sql`.
 */
export const SHORTCUT_WRITE_POLICIES_ON_TREATMENT = SHORTCUT_STORAGE_CUTOVER;

/** The shortcut's write policies as stored on the ACTIVE storage — `null`
 * when this row has none. Reads the treatment-backed column after the
 * cutover; `null` before it, where the converters lift the nested key. */
export function writePoliciesOfShortcutRow(
  row: ShortcutRowLike,
): Record<string, unknown> | null {
  if (!SHORTCUT_WRITE_POLICIES_ON_TREATMENT) return null;
  const raw = (row as Record<string, unknown>).write_policies;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The mandate key behind a shortcut row — `null` before the cutover. */
export function mandateKeyOfShortcutRow(row: ShortcutRowLike): string | null {
  if (!SHORTCUT_STORAGE_CUTOVER) return null;
  return ((row as Record<string, unknown>).mandate_key as string | null) ?? null;
}
