// features/mandates/list-door.ts
//
// THE ONE MANDATE LIST DOOR, client side.
//
// `public.mnd_list_scoped(p_home, p_resolution_for, …)` is the single place a
// browser may ask which mandates exist and who fulfils them
// (common-docs/projects/workflow-mandate-program/DESIGN-one-resolution.md v2 §
// "Lists — the one door, two parameters"). It takes TWO independent
// parameters, and conflating them is what produced the leak this campaign
// closes:
//
//   OWNERSHIP  (p_home)           whose mandates are in the corpus at all.
//                                 'system'      the platform's own (admin-only;
//                                               a non-admin is REFUSED with the
//                                               reason, never handed an empty
//                                               list).
//                                 'org:<uuid>'  that organization's own; the
//                                               door proves membership.
//                                 'all'         the platform's plus every
//                                               organization the caller
//                                               belongs to — a personal
//                                               workspace is just an
//                                               organization (D-R3).
//   RESOLUTION (p_resolution_for) whose ladder is computed for each of them.
//                                 'mine'  who fulfils it FOR ME, in the
//                                         organization I pass (D-R1: the org
//                                         rung is the ACTIVE org — pass no
//                                         organization and there is no org
//                                         rung, deliberately fail-closed).
//                                 'org'   who fulfils it for EVERY MEMBER of
//                                         the organization I pass, personal
//                                         overrides excluded. The only honest
//                                         answer on an organization's own
//                                         settings page.
//
// Both mandate list callers — /mandates and an organization's settings — and
// the admin console go through this module. There is no second caller of the
// RPC and no second definition of what a home means.
//
// 🚨 A REFUSAL IS NOT AN EMPTY LIST. The door raises 42501 with a sentence and
// a reason when the caller asks for a corpus that is not theirs; this module
// carries those words out intact so a screen can print them. Swallowing one
// into `[]` re-creates exactly the "empty for one reason and empty for a
// completely different reason with the same appearance" defect the migration
// was written to kill (REVIEW-one-resolution.md §8b).

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { MandateListRow } from "./browse/types";

/** WHOSE mandates are in the corpus. */
export type MandateHome =
  | { kind: "all" }
  | { kind: "system" }
  | { kind: "org"; organizationId: string };

/** The default: the platform's own plus every organization the caller is in. */
export const ALL_HOMES: MandateHome = { kind: "all" };
export const SYSTEM_HOME: MandateHome = { kind: "system" };
/**
 * Upper bound for a full-corpus read through this door. The system home
 * holds 409 rows today (measured live 2026-09-07), so reaching this is a
 * real anomaly — and the caller that reaches it SAYS SO rather than
 * silently rendering a truncated list.
 */
export const MANDATE_HOME_CEILING = 10_000;

export function orgHome(organizationId: string): MandateHome {
  return { kind: "org", organizationId };
}

/** The `p_home` string the RPC takes. The ONE place this format is written. */
export function homeParam(home: MandateHome): string {
  switch (home.kind) {
    case "system":
      return "system";
    case "org":
      return `org:${home.organizationId}`;
    case "all":
      return "all";
  }
}

/** WHOSE ladder is computed for each mandate in the corpus. */
export type MandateResolutionFor = "mine" | "org";

export interface MandateListDoorQuery {
  /** Defaults to every home the caller can see. */
  home?: MandateHome;
  /** Defaults to the caller's own ladder. */
  resolutionFor?: MandateResolutionFor;
  /**
   * The organization the ladder resolves in — the ACTIVE org for `mine`, the
   * subject org for `org` (which the door requires). Never optional for `org`.
   */
  organizationId?: string | null;
  search?: string;
  sort?: string;
  dir?: "asc" | "desc";
  filters?: Json;
  limit?: number;
  offset?: number;
}

/**
 * A refusal or failure from the one list door, with the database's own words
 * kept whole. `message` is what a screen prints: the sentence plus the reason,
 * both written for a person. The `hint` is the door's remedy in RPC terms —
 * kept for the console, never printed at a user.
 */
export class MandateListDoorError extends Error {
  readonly code: string | null;
  readonly detail: string | null;
  readonly hint: string | null;
  /** True when the door refused this caller (42501), rather than failing. */
  readonly refused: boolean;

  constructor(init: {
    message: string;
    code?: string | null;
    detail?: string | null;
    hint?: string | null;
  }) {
    const sentence = [init.message?.trim(), init.detail?.trim()]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    super(
      sentence ||
        "The mandate list door returned an error with no message — usually a gateway/PostgREST failure rather than a query error.",
    );
    this.name = "MandateListDoorError";
    this.code = init.code ?? null;
    this.detail = init.detail ?? null;
    this.hint = init.hint ?? null;
    this.refused = init.code === "42501";
  }
}

export function isMandateListRefusal(error: unknown): boolean {
  return error instanceof MandateListDoorError && error.refused;
}

/**
 * Ask the one door. Returns the rows exactly as the database shaped them —
 * this module resolves nothing, derives nothing and hides nothing.
 */
export async function listMandatesScoped(
  query: MandateListDoorQuery = {},
): Promise<MandateListRow[]> {
  const home = query.home ?? ALL_HOMES;
  const organizationId = query.organizationId ?? null;
  const { data, error } = await supabase.rpc("mnd_list_scoped", {
    p_home: homeParam(home),
    p_resolution_for: query.resolutionFor ?? "mine",
    ...(organizationId ? { p_org_id: organizationId } : {}),
    ...(query.search ? { p_search: query.search } : {}),
    p_sort: query.sort ?? "label",
    p_dir: query.dir ?? "asc",
    p_filters: query.filters ?? {},
    p_limit: query.limit ?? 25,
    p_offset: query.offset ?? 0,
  });
  if (error) {
    throw new MandateListDoorError({
      message: error.message,
      code: error.code,
      detail: error.details,
      hint: error.hint,
    });
  }
  return data ?? [];
}

/**
 * How many mandates one home holds, without carrying the rows back. The count
 * comes from the door's own `total_count` window — never from a second
 * predicate that could drift away from what the list actually shows.
 */
export async function countMandatesInHome(
  home: MandateHome,
  query: Omit<MandateListDoorQuery, "home" | "limit" | "offset"> = {},
): Promise<number> {
  const rows = await listMandatesScoped({ ...query, home, limit: 1, offset: 0 });
  return rows.length > 0 ? Number(rows[0].total_count) : 0;
}
