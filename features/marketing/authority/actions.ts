import {
  getPageWorkspace,
  updatePageDesiredValues,
} from "@/features/marketing/data/service";
import {
  readPageDesiredValues,
  type PlannedLinkEntry,
} from "@/features/marketing/types";
import { normalizePlanUrl } from "@/features/marketing/data/page-links";
import type { AuthorityRecommendation } from "./types";

function addPlannedLink(
  entries: PlannedLinkEntry[] | undefined,
  url: string,
  anchorText: string,
): PlannedLinkEntry[] {
  const existing = entries ?? [];
  const match = existing.find(
    (entry) => normalizePlanUrl(entry.url) === normalizePlanUrl(url),
  );
  if (match) {
    return existing.map((entry) =>
      entry.id === match.id ? { ...entry, anchor_text: anchorText } : entry,
    );
  }
  return [
    ...existing,
    { id: crypto.randomUUID(), url, anchor_text: anchorText },
  ];
}

/**
 * One click enters the recommendation into BOTH existing page link-plan
 * directions. Re-running is idempotent by partner URL and refreshes the anchor.
 */
export async function addAuthorityRecommendationToPlan(
  siteId: string,
  recommendation: AuthorityRecommendation,
): Promise<void> {
  const [sourceWorkspace, targetWorkspace] = await Promise.all([
    getPageWorkspace(siteId, recommendation.source_page_id),
    getPageWorkspace(siteId, recommendation.target_page_id),
  ]);
  const sourceDesired = readPageDesiredValues(sourceWorkspace.page);
  const targetDesired = readPageDesiredValues(targetWorkspace.page);
  const previousOutbound = sourceDesired.outbound_links;
  await updatePageDesiredValues({
    siteId,
    pageId: recommendation.source_page_id,
    patch: {
      outbound_links: addPlannedLink(
        sourceDesired.outbound_links,
        recommendation.target_url,
        recommendation.anchor_text,
      ),
    },
  });
  try {
    await updatePageDesiredValues({
      siteId,
      pageId: recommendation.target_page_id,
      patch: {
        inbound_links: addPlannedLink(
          targetDesired.inbound_links,
          recommendation.source_url,
          recommendation.anchor_text,
        ),
      },
    });
  } catch (targetError) {
    try {
      await updatePageDesiredValues({
        siteId,
        pageId: recommendation.source_page_id,
        patch: { outbound_links: previousOutbound ?? [] },
      });
    } catch (rollbackError) {
      throw new AggregateError(
        [targetError, rollbackError],
        "The target plan update failed and the source-plan rollback also failed.",
      );
    }
    throw targetError;
  }
}

export async function dismissAuthorityRecommendation(
  siteId: string,
  recommendation: AuthorityRecommendation,
): Promise<void> {
  const sourceWorkspace = await getPageWorkspace(
    siteId,
    recommendation.source_page_id,
  );
  const desired = readPageDesiredValues(sourceWorkspace.page);
  const dismissed = Array.from(
    new Set([
      ...(desired.authority_router_dismissed ?? []),
      recommendation.candidate_key,
    ]),
  );
  await updatePageDesiredValues({
    siteId,
    pageId: recommendation.source_page_id,
    patch: { authority_router_dismissed: dismissed },
  });
}
