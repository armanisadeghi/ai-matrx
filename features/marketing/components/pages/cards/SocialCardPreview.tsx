"use client";

import type {
  MarketingPage,
  PageSnapshot,
} from "@/features/marketing/types";
import { evaluatePageSocialCard } from "@/features/marketing/lib/marketing-page-scope";
import { AuditIssueList } from "@/features/marketing/seo/audit/AuditIssueList";
import {
  SocialCard,
  parseSocialDomain,
  type SocialPlatform,
} from "@/features/marketing/seo/social/SocialCard";

/**
 * Social share preview — canonical platform-faithful cards (features/marketing/seo/
 * social) for the OBSERVED share tags, with a platform toggle and the
 * deterministic checks (features/marketing/seo/audit, exact parity with the scraper's
 * crawl-time `audit_metrics.social`).
 */
export function SocialCardPreview({
  snapshot,
  page,
  platform,
}: {
  snapshot: PageSnapshot;
  page: MarketingPage;
  platform: SocialPlatform;
}) {
  // The SAME deterministic evaluation the surface scope emits (social_card).
  const evaluation = evaluatePageSocialCard(snapshot);

  return (
    <div className="grid gap-3 p-3">
      <SocialCard
        platform={platform}
        title={evaluation.title}
        description={evaluation.description}
        image={evaluation.image}
        domain={parseSocialDomain(evaluation.url ?? page.url)}
        cardType={evaluation.cardType ?? "summary"}
        className="max-w-md"
      />
      <p className="text-[10px] text-muted-foreground">
        {evaluation.cardType
          ? `Twitter card: ${evaluation.cardType}`
          : "No Twitter card tag"}
        {evaluation.ogType ? ` · og:type ${evaluation.ogType}` : ""}
        {evaluation.titleSource === "twitter"
          ? " · title from twitter:title"
          : ""}
      </p>
      <AuditIssueList
        issues={evaluation.issues}
        successText="Share tags look great — title, image, description, card type, and canonical link are all present."
        compact
      />
    </div>
  );
}
