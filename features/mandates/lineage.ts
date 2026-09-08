"use client";

// features/mandates/lineage.ts
//
// MANDATE → MANDATE LINEAGE, read from the ONE column that records it:
// `mandate.definition.source_mandate_id` (aidream 0592).
//
// Two questions, both answerable from that column and nothing else:
//   · "was this mandate promoted or copied from another one?"  — the copy's
//     own `source_mandate_id`, resolved to the ancestor's label and key.
//   · "how many copies were made from this one?"               — a count of
//     the rows pointing back at it.
//
// 🚨 NOT LEGACY LINEAGE. 679 of the 682 live definitions carry
// `metadata.legacy_table` / `metadata.legacy_id`, and that addresses the
// LEGACY `agent.shortcut` / app row a mandate was migrated FROM — a different
// table and a different question, read by `mandate.shortcut_key_map`. Nothing
// here touches it.
//
// A lineage line that cannot be read SAYS SO to the console and renders
// nothing; it never renders as "no ancestor", which is a different fact.

import { createClient } from "@/utils/supabase/client";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";

export interface MandateAncestor {
  id: string;
  mandateKey: string;
  label: string;
}

export interface MandateLineage {
  /** The mandate this one was copied from, or null when it was authored here. */
  source: MandateAncestor | null;
  /**
   * TRUE when this mandate HAS an ancestor that this caller cannot read — the
   * copy left an organization they do not belong to. "There is no ancestor"
   * and "you cannot see the ancestor" are different facts and the screen says
   * which one it is; a silently missing line would be the lie this campaign
   * exists to remove.
   */
  sourceUnreadable: boolean;
  /** How many live mandates name this one as their source. */
  copies: number;
}

export const NO_LINEAGE: MandateLineage = {
  source: null,
  sourceUnreadable: false,
  copies: 0,
};

/**
 * The lineage of ONE mandate. `sourceMandateId` comes from the row the caller
 * already holds, so the ancestor read is a by-id read (explicitly legal under
 * the canonical-selection law) and the copy count is a head count — never a
 * corpus scan.
 */
export async function fetchMandateLineage(
  mandateId: string,
  sourceMandateId: string | null,
): Promise<MandateLineage> {
  const supabase = createClient();

  const [ancestor, copies] = await Promise.all([
    // No `deleted_at` filter: a REMOVED ancestor is still where this copy
    // came from, and hiding it would make the line disappear the day someone
    // tidies the original.
    sourceMandateId
      ? mandateDefinitions(supabase)
          .select("id, mandate_key, label")
          .eq("id", sourceMandateId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    mandateDefinitions(supabase)
      .select("id", { count: "exact", head: true })
      .eq("source_mandate_id", mandateId)
      .is("deleted_at", null),
  ]);

  if (ancestor.error) throw ancestor.error;
  if (copies.error) throw copies.error;

  return {
    source: ancestor.data
      ? {
          id: ancestor.data.id,
          mandateKey: ancestor.data.mandate_key,
          label: ancestor.data.label,
        }
      : null,
    sourceUnreadable: Boolean(sourceMandateId) && !ancestor.data,
    copies: copies.count ?? 0,
  };
}
