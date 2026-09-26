// features/mandates/member-list/rpc.ts
//
// The ONE call into `public.mnd_member_list`
// (migrations/mnd_member_list_server_read_2026_09_25.sql) — the non-admin
// sibling of `mnd_admin_list`. Signed-in people only; RLS-respecting.

import { mandateStatusOf } from "@/features/mandates/status/mandate-status";
import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import type { MandateMemberRow } from "./types";

export type MandateMemberListArgs =
  Database["public"]["Functions"]["mnd_member_list"]["Args"];

/** One row of a `page` answer, as the database spells it. */
export interface MandateMemberWireRow {
  id: string;
  mandate_key: string;
  name: string;
  feature_label: string;
  goal: string | null;
  created_by_me: boolean | null;
  organization_id: string | null;
  is_system: boolean | null;
  home_label: string;
  holder_type: string | null;
  holder_id: string | null;
  holder_name: string;
  decided_by: string;
  decided_rung: string | null;
  pin_text: string;
  customized_by: string[];
  health: string;
  origin: string;
  visibility: string;
  is_enabled: boolean;
  updated_at: string | null;
  created_at: string | null;
}

export interface MandateMemberPageAnswer {
  total: number;
  rows: MandateMemberWireRow[];
}

export interface MandateMemberCountsAnswer {
  mine: number;
  /** Granted to me personally (share ≠ move; 2026-09-25). */
  shared: number;
  /** Homed in OR shared with one of my organizations. */
  orgs: number;
  /** Published by somebody else outside my organizations (the community lane). */
  public: number;
  system: number;
  orgs_narrow: { id: string; label: string; count: number }[];
}

export type MandateMemberFacetsAnswer = Record<string, { value: string; count: number }[]>;

const RUNGS = new Set(["user", "org", "system"]);

/** Wire → row. Pure. A null `created_by_me` (no creator) is "not mine". */
export function memberRowFromWire(wire: MandateMemberWireRow): MandateMemberRow {
  return {
    id: wire.id,
    mandateKey: wire.mandate_key,
    name: wire.name,
    featureLabel: wire.feature_label,
    goal: wire.goal,
    createdByMe: wire.created_by_me === true,
    organizationId: wire.organization_id,
    isSystem: wire.is_system === true,
    homeLabel: wire.home_label,
    holderType: wire.holder_type,
    holderId: wire.holder_id,
    holderName: wire.holder_name,
    decidedBy: wire.decided_by,
    decidedRung: wire.decided_rung && RUNGS.has(wire.decided_rung)
      ? (wire.decided_rung as MandateMemberRow["decidedRung"])
      : null,
    pinText: wire.pin_text,
    customizedBy: wire.customized_by ?? [],
    health: wire.health,
    origin: wire.origin === "code" ? "code" : "soft",
    visibility: wire.visibility,
    isEnabled: wire.is_enabled,
    // The same rule the database facets by (mnd_list_status_facet_2026_09_25):
    // from this seat, "draft" means nothing resolves to run it.
    status: mandateStatusOf({ isEnabled: wire.is_enabled, hasHolder: wire.holder_type != null }),
    updatedAt: wire.updated_at,
    createdAt: wire.created_at,
  };
}

export async function callMandateMemberList<T>(args: MandateMemberListArgs): Promise<T> {
  const { data, error } = await supabase.rpc("mnd_member_list", args);
  if (error) {
    throw new Error(`Mandate list (${args.p_mode ?? "page"}): ${error.message}`);
  }
  return data as Json as unknown as T;
}
