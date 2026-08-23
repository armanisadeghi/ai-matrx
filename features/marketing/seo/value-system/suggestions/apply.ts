/**
 * APPROVAL — replay one agent proposal through the ORDINARY HUMAN WRITE PATH.
 *
 * 🚨 THE RULE THIS FILE ENFORCES: approval opens no writer of its own. Every
 * branch below calls the exact function a person clicking in the UI calls, so
 * an approved suggestion is indistinguishable from a human ruling — same RPC,
 * same governance, same provenance, same audit row. If a future proposal kind
 * has no existing human path, the path is built for humans FIRST and this file
 * calls it; a private "apply" writer here would be the parallel-writer defect
 * the convergence exists to remove.
 *
 * | Proposal         | The path it replays                                    |
 * |------------------|--------------------------------------------------------|
 * | `matcher`        | `seo.dimension_matcher_upsert` (Dimensions editor)     |
 * | `worth`          | `seo.site_value_worth_upsert`  (Dimensions editor)     |
 * | `stamp` (class)  | `seo.gsc_set_keyword_class`    (classification bench)  |
 * | `stamp` (other)  | `seo.keyword_facet_set`        (classification bench)  |
 * | `guideline_edit` | `seo.gsc_set_site_kw_guidelines` (guidelines panel)    |
 *
 * An approved stamp is written with source `human` and origin `manual` on
 * purpose — a human looked at it and said yes, so it outranks every matcher
 * and the classifier (P19 precedence: human > matcher > AI). The agent's part
 * is recorded in the assist row's provenance, not by weakening the ruling.
 *
 * SoR: /systems/marketing/seo/seo-keywords/value-system.md § Suggestions
 */

import {
  upsertDimensionMatcher,
  upsertSiteValueWorth,
} from "@/features/marketing/seo/value-system/dimensions/data";
import {
  setGscKeywordClass,
  type GscClassRuling,
} from "@/features/marketing/search-console/data-classification";
import {
  getKwGuidelines,
  setKwGuidelines,
} from "@/features/marketing/search-console/data-kw-guidelines";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage } from "@/utils/errors";
import type { KeywordMeaningProposal } from "./proposal";

/** The traffic-class dimension has its own ruling RPC (C3) — stamps route to it. */
const TRAFFIC_CLASS_DIMENSION = "traffic_class";

export interface ApprovalOutcome {
  /** One plain sentence for the receipt toast. */
  receipt: string;
  /** What actually landed, for the assist row's `result`. */
  detail: Record<string, string | number>;
}

async function stampFacet(
  siteId: string,
  dimension: string,
  value: string,
  keywordIds: string[],
): Promise<number> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase.schema("seo").rpc("keyword_facet_set", {
    p_keyword_ids: keywordIds,
    p_dimension: dimension,
    p_value: value,
    p_source: "human",
    p_site_id: siteId,
  });
  if (response.error) {
    throw new Error(extractErrorMessage(response.error).split(" · ")[0], {
      cause: response.error,
    });
  }
  return response.data?.length ?? 0;
}

export async function applyKeywordMeaningProposal(
  siteId: string,
  proposal: KeywordMeaningProposal,
): Promise<ApprovalOutcome> {
  switch (proposal.proposal) {
    case "matcher": {
      const row = await upsertDimensionMatcher({
        siteId,
        valueId: proposal.valueId,
        kind: proposal.matcherKind,
        pattern: proposal.pattern,
        placeId: proposal.placeId,
        factValueId: proposal.factValueId,
        conditionRuleId: proposal.conditionRuleId,
        // The rule is now the site's own — a human approved it. `agent` would
        // claim the site never agreed, which is the opposite of what happened.
        origin: "human",
        notes: proposal.notes,
      });
      return {
        receipt: `Added the matcher to ${proposal.dimensionLabel} → ${proposal.valueLabel}. Re-run the matchers to stamp keywords with it.`,
        detail: { matcher_id: row.id, value_id: proposal.valueId },
      };
    }

    case "worth": {
      const row = await upsertSiteValueWorth({
        siteId,
        valueId: proposal.valueId,
        effect: proposal.effect,
        amount: proposal.amount,
        origin: "human",
        notes: proposal.notes,
      });
      return {
        receipt: `Saved what "${proposal.valueLabel}" is worth to this site.`,
        detail: {
          worth_id: row?.id ?? "cleared",
          effect: proposal.effect,
          amount: proposal.amount ?? 0,
        },
      };
    }

    case "stamp": {
      if (proposal.dimensionSlug === TRAFFIC_CLASS_DIMENSION) {
        const rows = await setGscKeywordClass(
          siteId,
          proposal.keywordIds,
          proposal.valueSlug as GscClassRuling,
          proposal.notes ?? null,
          { origin: "manual", confirmed: true },
        );
        return {
          receipt: `Ruled ${rows.length} keyword${rows.length === 1 ? "" : "s"} as ${proposal.valueLabel}.`,
          detail: { keywords: rows.length, value: proposal.valueSlug },
        };
      }
      const stamped = await stampFacet(
        siteId,
        proposal.dimensionSlug,
        proposal.valueSlug,
        proposal.keywordIds,
      );
      return {
        receipt: `Stamped ${stamped} keyword${stamped === 1 ? "" : "s"} as ${proposal.valueLabel}.`,
        detail: { keywords: stamped, value_id: proposal.valueId },
      };
    }

    case "guideline_edit": {
      // Optimistic concurrency, hand-rolled nowhere else: the guidelines RPC
      // bumps its own version, so the only honest guard is to re-read it and
      // refuse when it moved under the proposal. Silently overwriting the
      // human's own later edit with an older agent draft is the failure.
      const current = await getKwGuidelines(siteId);
      if (current.guidelines_version !== proposal.baseVersion) {
        throw new Error(
          `These guidelines changed since this was suggested (it was written against version ${proposal.baseVersion}, the document is now at version ${current.guidelines_version}). Reject this and ask for a fresh suggestion so nothing you wrote is lost.`,
        );
      }
      const saved = await setKwGuidelines(siteId, proposal.proposedText);
      return {
        receipt: `Saved the guidelines (now version ${saved.guidelines_version}). Every agent reads the new text from its next run on.`,
        detail: { version: saved.guidelines_version },
      };
    }
  }
}
