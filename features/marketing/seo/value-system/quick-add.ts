/**
 * THE "+ Add" CLIENT PRIMITIVE — P23.
 *
 * Arman, 2026-08-23: *"the moment I went in to assign a tier, I got a pop up
 * that forced me to choose from the shitty options I had in front of me…
 * it's the lazy coding agent who builds a popover with a drop down, but is
 * too lazy to include an add feature."*
 *
 * Every picker of a keyword dimension value imports THIS. One call turns what
 * a person typed into a real value — creating the site's own dimension when
 * they are inventing one — and answers with the ids so the picker selects it
 * immediately. Deliberately a standalone module so every surface (filter bar,
 * workbench, context menu, bulk panel) shares one path and no one is tempted
 * to write a second.
 *
 * Server contract: `seo.gsc_quick_add_value` (migrations/seo_stamp_assignment_layer.sql).
 * A PLATFORM dimension refuses for non-super-admins with a sentence a person
 * can act on — surface that message verbatim; it names the local-override path.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";

const assertGoverned = makeAssertData("add that option");

/**
 * The governed refusals this path raises, kept as a typed error so a caller can
 * branch on P11 without string-matching. Every one of these carries a sentence
 * AFTER the colon written for a non-technical reader — it is surfaced verbatim,
 * never replaced with "something went wrong".
 */
export class QuickAddRefusal extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "QuickAddRefusal";
    this.code = code;
  }
  /**
   * P11 — a vocabulary every tenant shares, which a site may not widen. The
   * ONLY correct answer is the local-override path ("make this your own
   * dimension"), never a bare refusal.
   */
  get isPlatformVocabulary(): boolean {
    return this.code === "seo_platform_dimension_readonly";
  }
}

const GOVERNED_CODE = /^(seo_[a-z_]+|gsc_site_[a-z_]+):\s*/;

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

export interface QuickAddedValue {
  dimension_id: string;
  dimension_slug: string;
  dimension_label: string;
  value_id: string;
  value_key: string;
  value_label: string;
  created_dimension: boolean;
  created_value: boolean;
}

export async function quickAddDimensionValue(input: {
  siteId: string;
  /** What the person typed. Becomes the value's label verbatim. */
  valueLabel: string;
  /** Add to this dimension… */
  dimensionId?: string | null;
  /** …or invent one with this name. */
  newDimensionLabel?: string | null;
  description?: string | null;
  /** Situational = describes the keyword's situation on this site now (P20). */
  nature?: "intrinsic" | "situational";
}): Promise<QuickAddedValue> {
  const response = await (await seoDb()).rpc("gsc_quick_add_value", {
    p_site_id: input.siteId,
    p_value_label: input.valueLabel,
    p_dimension_id: input.dimensionId ?? undefined,
    p_new_dimension_label: input.newDimensionLabel ?? undefined,
    p_description: input.description ?? undefined,
    p_nature: input.nature ?? "intrinsic",
  });
  if (response.error) {
    const message = extractErrorMessage(response.error).split(" · ")[0];
    const governed = message.match(GOVERNED_CODE);
    if (governed) {
      throw new QuickAddRefusal(
        governed[1],
        message.slice(governed[0].length),
        response.error,
      );
    }
  }
  return assertGoverned(response.data, response.error) as unknown as QuickAddedValue;
}

/**
 * Assign (or clear) a dimension value on keywords — single row, quick-assign
 * from a right-click, or a bulk selection. `notes` is the expert's REASON and
 * is stored on the stamp, because that sentence is what an AI later learns the
 * pattern from (P24). Human stamps are pinned: no matcher run overwrites them.
 */
export async function setKeywordStamps(input: {
  siteId: string;
  keywordIds: string[];
  valueId: string;
  notes?: string | null;
  clear?: boolean;
}): Promise<{ written: number; replaced?: number; cleared?: number; notes_saved?: boolean }> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_stamps", {
    p_site_id: input.siteId,
    p_keyword_ids: input.keywordIds,
    p_value_id: input.valueId,
    p_notes: input.notes ?? undefined,
    p_clear: input.clear ?? false,
  });
  return assertGoverned(response.data, response.error) as unknown as {
    written: number;
    replaced?: number;
    cleared?: number;
    notes_saved?: boolean;
  };
}
