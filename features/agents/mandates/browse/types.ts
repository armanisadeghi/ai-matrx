// features/agents/mandates/browse/types.ts
//
// What is genuinely MANDATES-specific about the canonical entity list.
// One row per live mandate, exactly as public.mnd_list_scoped returns it,
// with the caller's own resolution baked in server-side (user > org > system).

import type { ListScopeKind } from "@/lib/list-scope/types";

/**
 * 🚨 LOCAL RPC ROW TYPE — the mnd_* functions postdate types/database.types.ts
 * and the gen CLI currently truncates the file on regen (same limitation
 * recorded in ./provisions.ts for the wave-1 columns). This interface mirrors
 * the RETURNS TABLE of migrations/mnd_list_scoped.sql 1:1. Delete it and
 * switch to `Database["public"]["Functions"]["mnd_list_scoped"]["Returns"]`
 * on the next successful `pnpm db-types`.
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
  /** Which layer decides the Holder for THIS caller. */
  resolved_layer: "user" | "org" | "system";
  resolved_agent_id: string | null;
  resolved_agent_name: string | null;
  resolved_agent_type: string | null;
  resolved_use_latest: boolean;
  pinned_version_number: number | null;
  latest_version: number | null;
  /** "v2 → v4" when pinned and behind, else null. Server-derived, never re-derived. */
  drift: string | null;
  health: MandateListHealth;
  has_settings_override: boolean;
  updated_at: string;
  total_count: number;
}

export type MandateListHealth =
  | "ok"
  | "drift"
  | "holder archived"
  | "holder missing"
  | "disabled";

/** Mandates are platform rows — every caller sees the registry. ONE scope. */
export const MANDATE_LIST_SCOPES: ListScopeKind[] = ["mine"];

export const LAYER_META: Record<
  MandateListRow["resolved_layer"],
  { label: string; className: string }
> = {
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
};

export const HEALTH_META: Record<
  MandateListHealth,
  { label: string; className: string }
> = {
  ok: { label: "OK", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  drift: { label: "Drift", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  "holder archived": { label: "Holder archived", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  "holder missing": { label: "Holder missing", className: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  disabled: { label: "Disabled", className: "border-border/70 text-muted-foreground" },
};

/** The dedicated per-mandate route (dots are legal path segment characters). */
export function mandateRoute(row: Pick<MandateListRow, "mandate_key">): string {
  return `/agents/mandates/${encodeURIComponent(row.mandate_key)}`;
}
