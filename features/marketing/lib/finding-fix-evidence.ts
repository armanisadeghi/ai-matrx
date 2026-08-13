/**
 * Build the CODE pipe's evidence from rows the crawler already stored.
 *
 * `planDeterministicFix` (finding-fix.ts) is pure and knows nothing about our
 * tables; this is the ONE adapter between `web.page` + `web.snapshot` and that
 * planner, so a second caller (the assists producer, a batch runner, the
 * finding detail card) can never assemble a DIFFERENT evidence set and get a
 * different draft for the same finding.
 *
 * Both parsers are the shipped ones (`parseSnapshotHeadTags`,
 * `parseSnapshotHeadings`) — never a second reading of the same JSON.
 *
 * Pure module (no React, no I/O).
 */

import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { parseSnapshotHeadings } from "@/features/marketing/lib/snapshot-content";
import type { FindingFixEvidence } from "@/features/marketing/lib/finding-fix";
import type {
  MarketingPage,
  MarketingSite,
  PageSnapshot,
} from "@/features/marketing/types";

export function buildFindingFixEvidence(args: {
  itemKey: string;
  page: MarketingPage;
  snapshot: PageSnapshot | null;
  site?: Pick<MarketingSite, "name"> | null;
}): FindingFixEvidence {
  const { itemKey, page, snapshot, site } = args;
  const head = snapshot ? parseSnapshotHeadTags(snapshot.head_tags) : null;
  const headings = snapshot ? parseSnapshotHeadings(snapshot.headings) : null;
  const h1 = headings?.all.find((entry) => entry.level === 1)?.text ?? null;

  return {
    itemKey,
    currentTitle: head?.title ?? null,
    currentMetaDescription: head?.metaDescription ?? null,
    h1,
    ogTitle: head?.og.title ?? null,
    ogDescription: head?.og.description ?? null,
    twitterTitle: head?.twitter.title ?? null,
    twitterDescription: head?.twitter.description ?? null,
    brandName: site?.name ?? head?.og.siteName ?? null,
    desiredTitle: page.meta_title_desired,
    desiredMetaDescription: page.meta_description_desired,
  };
}
