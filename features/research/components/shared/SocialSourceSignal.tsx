"use client";

// A social post's engagement and outlier multiple, on the line a source row already has.
// Renders nothing for a source that is not a captured social post or profile.
// The badge is THE marketing outlier badge — imported, never restyled here.

import { OutlierBadge } from "@/features/marketing/social/components/OutlierBadge";
import { PlatformMark } from "@/features/marketing/social/components/PlatformMark";
import { formatCompact } from "@/features/marketing/social/outlier";
import { cn } from "@/lib/utils";
import type { ResearchSource } from "../../types";
import { socialFactsOf, socialPostCardModel } from "../../utils/socialSource";

// A count the platform did not report is left out: "No views" already says so once on the badge.
function Stat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span className="tabular-nums" title={label}>
      {formatCompact(value)} <span className="text-muted-foreground/70">{label}</span>
    </span>
  );
}

export function SocialSourceSignal({
  source,
  className,
}: {
  source: ResearchSource;
  className?: string;
}) {
  const facts = socialFactsOf(source);
  if (!facts) return null;
  if (facts.kind === "profile") {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-muted-foreground", className)}>
        <PlatformMark platform={facts.platform} />
        <Stat label="followers" value={facts.followers} />
        {facts.handle && <span>@{facts.handle}</span>}
      </div>
    );
  }
  const card = socialPostCardModel(source, facts);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-muted-foreground", className)}>
      <PlatformMark platform={facts.platform} />
      <OutlierBadge input={card.outlier} />
      <Stat label="views" value={facts.views} />
      <Stat label="likes" value={facts.likes} />
      <Stat label="comments" value={facts.comments} />
      {facts.handle && <span>@{facts.handle}</span>}
    </div>
  );
}
