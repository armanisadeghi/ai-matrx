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
import type { KeywordMeaningProposal, OfferingProposal } from "./proposal";

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

function rpcError(error: unknown): Error {
  return new Error(extractErrorMessage(error).split(" · ")[0], { cause: error });
}

/** The organization that owns the site — every offering write names it. */
async function siteOrganizationId(siteId: string): Promise<string> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("web")
    .from("site")
    .select("organization_id")
    .eq("id", siteId)
    .single();
  if (response.error) throw rpcError(response.error);
  return response.data.organization_id;
}

async function findSiteOfferingByName(
  siteId: string,
  name: string,
): Promise<string | null> {
  const response = await supabase
    .schema("web")
    .rpc("site_offerings", { p_site_id: siteId });
  if (response.error) throw rpcError(response.error);
  const wanted = name.trim().toLowerCase();
  const match = (response.data ?? []).find(
    (row) => row.name.trim().toLowerCase() === wanted,
  );
  return match?.id ?? null;
}

async function saveSiteOffering(
  organizationId: string,
  siteId: string,
  proposal: OfferingProposal,
): Promise<string> {
  const response = await supabase.schema("web").rpc("save_site_offering", {
    p_organization_id: organizationId,
    p_site_id: siteId,
    p_name: proposal.name,
    p_kind: proposal.offeringKind,
    ...(proposal.description ? { p_description: proposal.description } : {}),
  });
  if (response.error) throw rpcError(response.error);
  return response.data;
}

async function adoptOfferingTemplate(
  organizationId: string,
  siteId: string,
  templateId: string,
): Promise<string> {
  const response = await supabase.schema("web").rpc("adopt_offering_template", {
    p_organization_id: organizationId,
    p_site_id: siteId,
    p_template_id: templateId,
  });
  if (response.error) throw rpcError(response.error);
  return response.data;
}

/** The two canonical bounds: 2,000 keywords per placement read, 5,000 per write. */
const PLACEMENT_READ_CHUNK = 2000;

/**
 * Places the keywords an agent proposed with the offering, through the
 * ordinary human placement writer (`seo.gsc_set_keyword_offering`). A keyword
 * that already has a placement on this site keeps it: approving an offering is
 * not a ruling on a keyword someone (or the assigner) already put elsewhere.
 */
async function placeProposedKeywords(
  organizationId: string,
  siteId: string,
  offeringId: string,
  keywordIds: string[],
  note: string,
): Promise<{ placed: number; alreadyPlaced: number }> {
  let placed = 0;
  let alreadyPlaced = 0;
  for (let i = 0; i < keywordIds.length; i += PLACEMENT_READ_CHUNK) {
    const chunk = keywordIds.slice(i, i + PLACEMENT_READ_CHUNK);
    const current = await supabase
      .schema("seo")
      .rpc("gsc_keyword_offerings_for", {
        p_site_id: siteId,
        p_keyword_ids: chunk,
      });
    if (current.error) throw rpcError(current.error);
    const elsewhere = new Set(
      (current.data ?? [])
        .filter((row) => row.offering_id !== offeringId)
        .map((row) => row.keyword_id),
    );
    const open = chunk.filter((id) => !elsewhere.has(id));
    alreadyPlaced += chunk.length - open.length;
    if (open.length === 0) continue;
    const written = await supabase
      .schema("seo")
      .rpc("gsc_set_keyword_offering", {
        p_organization_id: organizationId,
        p_site_id: siteId,
        p_keyword_ids: open,
        p_offering_id: offeringId,
        p_notes: note,
      });
    if (written.error) throw rpcError(written.error);
    placed += open.length;
  }
  return { placed, alreadyPlaced };
}

async function setSiteOfferingWorth(
  organizationId: string,
  siteId: string,
  offeringId: string,
  points: number,
): Promise<void> {
  const response = await supabase.schema("seo").rpc("set_site_offering_value", {
    p_organization_id: organizationId,
    p_site_id: siteId,
    p_brand_offering_id: offeringId,
    p_worth_points: points,
  });
  if (response.error) throw rpcError(response.error);
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

    case "offering": {
      // KI-040 step 6 — replayed through THE canonical offering writers
      // (features/marketing/FEATURE.md § "Canonical offering writers — THE
      // CONTRACT"): `web.save_site_offering` creates the brand offering and
      // makes it available on this site; `seo.set_site_offering_value` sets
      // its worth in POINTS (D9). Both carry the site's own organization id
      // explicitly and refuse any other.
      const organizationId = await siteOrganizationId(siteId);
      // An agent's request to offer a platform suggestion (D2) adopts THAT
      // template — copy-on-adopt, D6. `web.adopt_offering_template` reuses the
      // brand's live copy, so a retried approval never mints a second one.
      // Otherwise: idempotent on the name the site already offers.
      const existing = proposal.templateId
        ? null
        : await findSiteOfferingByName(siteId, proposal.name);
      const offeringId = proposal.templateId
        ? await adoptOfferingTemplate(organizationId, siteId, proposal.templateId)
        : (existing ??
          (await saveSiteOffering(organizationId, siteId, proposal)));
      const placed = await placeProposedKeywords(
        organizationId,
        siteId,
        offeringId,
        proposal.keywordIds,
        `Approved the Offering assigner's proposal to offer "${proposal.name}" on this site.`,
      );
      if (proposal.valueAdd !== null) {
        await setSiteOfferingWorth(
          organizationId,
          siteId,
          offeringId,
          proposal.valueAdd,
        );
      }
      const points =
        proposal.valueAdd === null
          ? ""
          : ` and set its worth to ${proposal.valueAdd >= 0 ? "+" : ""}${proposal.valueAdd} points`;
      const keywordReceipt =
        proposal.keywordIds.length === 0
          ? ""
          : ` Placed ${placed.placed} keyword${placed.placed === 1 ? "" : "s"} on it${placed.alreadyPlaced > 0 ? `; ${placed.alreadyPlaced} already on another offering stayed where ${placed.alreadyPlaced === 1 ? "it was" : "they were"}` : ""}.`;
      return {
        receipt:
          (existing
            ? `"${proposal.name}" was already one of this site's offerings${points ? `; ${points.trim()}` : ""}.`
            : `Offered "${proposal.name}" on this site${points}.`) +
          keywordReceipt,
        detail: {
          offering_id: offeringId,
          organization_id: organizationId,
          created: existing ? 0 : 1,
          template_id: proposal.templateId ?? "none",
          keywords_placed: placed.placed,
          keywords_left_on_another_offering: placed.alreadyPlaced,
          worth_points: proposal.valueAdd ?? "not valued",
        },
      };
    }
  }
}
