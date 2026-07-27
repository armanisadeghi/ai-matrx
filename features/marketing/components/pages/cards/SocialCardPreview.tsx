"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";

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
  const desired = useDesiredValueSlice(page, "social_card");
  const draft = desired.draft ?? {};

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
      <DesiredSection
        hint="The share title/description this page SHOULD carry."
        dirty={desired.dirty}
        saving={desired.saving}
        onSave={() => void desired.save()}
        onReset={desired.reset}
        className="-mx-3 -mb-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="desired-og-title" className="text-xs">
            Desired share title
          </Label>
          <Input
            id="desired-og-title"
            value={draft.og_title ?? ""}
            onChange={(event) =>
              desired.setDraft({ ...draft, og_title: event.target.value })
            }
            placeholder={evaluation.title ?? "Editorial share title"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desired-og-description" className="text-xs">
            Desired share description
          </Label>
          <Textarea
            id="desired-og-description"
            value={draft.og_description ?? ""}
            onChange={(event) =>
              desired.setDraft({ ...draft, og_description: event.target.value })
            }
            minHeight={64}
            maxHeight={140}
            placeholder={evaluation.description ?? "Editorial share description"}
          />
        </div>
      </DesiredSection>
    </div>
  );
}
