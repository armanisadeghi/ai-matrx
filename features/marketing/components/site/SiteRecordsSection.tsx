"use client";

/**
 * SiteRecordsSection — "Records about this site" on the site's own overview.
 *
 * THE REVERSE VIEW, on an anchor that is not a conversation (DD-131 slice 2,
 * item 4). aidream's keyword-research pipeline already writes the edge this
 * reads: a `content_ir.kind_instance` → `web_site` row in
 * `platform.associations`. Everything a pipeline ever produces ABOUT a site
 * lands in this one list, because the list is anchored on the site, not on a
 * kind — no branch here names `keyword_relationship_research` or any other
 * shape.
 *
 * ## Why here
 *
 * `/marketing/[brandId]/websites/[siteId]` is the site's home: both legacy
 * addresses (`/marketing/sites/[siteId]` and `/marketing/[brandId]/seo/[siteId]`)
 * permanently redirect into this branch, and this page is the one a person
 * lands on from the brand's website list. The SEO sub-routes are workbenches
 * for one practice; the outputs a machine produced about the site belong on
 * the site itself, beside its workspace directory.
 *
 * ## Chrome only
 *
 * The list, the rows, the badge, the archive control and every failure
 * sentence come from `AnchorRecordsList` — the SAME component the chat
 * header's Records popover renders. This file contributes a section card and
 * the words that are true of a site.
 */

import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import {
  AnchorRecordsList,
  useAnchorRecords,
} from "@/features/content-ir/records/AnchorRecordsList";

export interface SiteRecordsSectionProps {
  siteId: string;
  siteName: string;
}

export function SiteRecordsSection({ siteId, siteName }: SiteRecordsSectionProps) {
  const state = useAnchorRecords({ type: "web_site", id: siteId });

  return (
    <SectionCard title="Records about this site" collapsible defaultOpen>
      <div className="p-3">
        <AnchorRecordsList
          state={state}
          loadingText={`Reading what has been produced about ${siteName}…`}
          emptyText={`Nothing yet. When a research run, an agent or a workflow produces a saved Shape about ${siteName} — keyword relationship research, an audit, anything with its own record — it is kept here with a link straight to it.`}
        />
      </div>
    </SectionCard>
  );
}
