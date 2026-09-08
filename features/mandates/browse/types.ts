// features/mandates/browse/types.ts
//
// What is genuinely MANDATES-specific about the canonical entity list.
// One row per live mandate, exactly as public.mnd_list_scoped returns it,
// with the resolution baked in server-side (user > the org you pass > system).
//
// 🚨 THE DATABASE OWNS BOTH VOCABULARIES ON THIS ROW. `resolved_layer` is a
// RUNG (system | global | org | user) and `health` is the door's own verdict —
// both are produced by `mandate._rungs` / `mnd_list_scoped`, and the DB may
// grow a value before this file hears about it. So neither is read by index
// into a Record: `layerMeta()` / `healthMeta()` are the ONE readers, and an
// unknown value is SHOWN AS ITSELF with a loud console error rather than
// crashing the row or being quietly relabelled as something it is not.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";

/**
 * The row `public.mnd_list_scoped` returns, with the nullability the generated
 * types flatten away (a `RETURNS TABLE` column is always nullable in practice).
 * Every field name and type otherwise comes from the generated contract, so a
 * signature change is a type error here instead of a runtime surprise — the
 * hand-rolled RPC seam this file used to carry is gone.
 */
export interface MandateListRow {
  id: string;
  mandate_key: string;
  label: string;
  description: string | null;
  feature: string;
  provision_key: string | null;
  offered_count: number;
  input_kind: string | null;
  output_kind: string | null;
  is_enabled: boolean;
  /** Which RUNG decides the Holder for the subject this list resolved for. */
  resolved_layer: string;
  resolved_agent_id: string | null;
  resolved_agent_name: string | null;
  resolved_agent_type: string | null;
  resolved_use_latest: boolean;
  pinned_version_number: number | null;
  latest_version: number | null;
  /** "v2 → v4" when pinned and behind, else null. Server-derived, never re-derived. */
  drift: string | null;
  health: string;
  has_settings_override: boolean;
  updated_at: string;
  total_count: number;
  /** False when the winning rung names a Holder that cannot be reached. */
  holder_live: boolean | null;
  /** False when the winning rung pins a version that cannot be reached. */
  version_live: boolean | null;
  /** The organization this mandate is HOMED in — its owner (D-R3). */
  home_organization_id: string | null;
}

/**
 * Compile-time proof that the interface above still describes the live RPC.
 * A column added, removed or retyped by a migration breaks HERE, at the door,
 * rather than as an undefined cell three components away.
 */
type LiveListRow =
  Database["public"]["Functions"]["mnd_list_scoped"]["Returns"][number];
type _RowMatchesLiveContract = LiveListRow extends MandateListRow ? true : never;
const _ROW_MATCHES_LIVE_CONTRACT: _RowMatchesLiveContract = true;
void _ROW_MATCHES_LIVE_CONTRACT;

/** The rungs the ladder can name. `global` is its own rung, never "system". */
export type MandateResolvedLayer = "user" | "org" | "system" | "global";

export type MandateListHealth =
  | "ok"
  | "drift"
  | "holder archived"
  | "holder missing"
  | "holder unreachable"
  | "version unreachable"
  | "disabled";

/**
 * THE OWNERSHIP AXIS. Mandates have no `created_by` scope — a person's
 * mandates are their organizations' mandates (D-R3) — so the tab set is the
 * organizations the caller belongs to, plus the platform's own corpus for an
 * admin. `/mandates` passes the admin-conditional subset itself; a
 * module-constant cannot read who is looking.
 */
export const MANDATE_LIST_SCOPES: ListScopeKind[] = ["orgs"];

export interface BadgeMeta {
  label: string;
  className: string;
}

export const LAYER_META: Record<MandateResolvedLayer, BadgeMeta> = {
  user: {
    label: "Yours",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  org: {
    label: "Organization",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  system: {
    label: "System",
    className: "border-border/70 text-muted-foreground",
  },
  global: {
    label: "Global",
    className:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  },
};

export const HEALTH_META: Record<MandateListHealth, BadgeMeta> = {
  ok: { label: "OK", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  drift: { label: "Drift", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  "holder archived": { label: "Holder archived", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  "holder missing": { label: "Holder missing", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  "holder unreachable": { label: "Holder unreachable", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  "version unreachable": { label: "Version unreachable", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  disabled: { label: "Disabled", className: "border-border/70 text-muted-foreground" },
};

const UNKNOWN_CLASS = "border-border/70 text-muted-foreground";

/** Every render of a rung badge goes through here. See the header. */
export function layerMeta(value: string): BadgeMeta {
  switch (value) {
    case "user":
    case "org":
    case "system":
    case "global":
      return LAYER_META[value];
  }
  console.error(
    `[mandates] mnd_list_scoped returned an unknown rung ${JSON.stringify(value)} — showing it verbatim. Add it to LAYER_META in features/mandates/browse/types.ts.`,
  );
  return { label: value, className: UNKNOWN_CLASS };
}

/** Every render of a health badge goes through here. See the header. */
export function healthMeta(value: string): BadgeMeta {
  switch (value) {
    case "ok":
    case "drift":
    case "holder archived":
    case "holder missing":
    case "holder unreachable":
    case "version unreachable":
    case "disabled":
      return HEALTH_META[value];
  }
  console.error(
    `[mandates] mnd_list_scoped returned an unknown status ${JSON.stringify(value)} — showing it verbatim. Add it to HEALTH_META in features/mandates/browse/types.ts.`,
  );
  return { label: value, className: UNKNOWN_CLASS };
}

/** The dedicated per-mandate route (dots are legal path segment characters). */
export function mandateRoute(row: Pick<MandateListRow, "mandate_key">): string {
  return `/mandates/${encodeURIComponent(row.mandate_key)}`;
}
