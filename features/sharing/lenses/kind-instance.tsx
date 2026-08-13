"use client";

/**
 * The `content_ir_kind_instance` share lens — a POLYMORPHIC token.
 *
 * One entity token carries many kinds (keyword research, flashcard sets,
 * briefs, decks…), and the token's public projection deliberately does not
 * include the kind — only `data`. So this lens dispatches on the DATA SHAPE
 * with a safe fallback, the same pattern as
 * `features/canvas/shared/PublicCanvasRenderer.tsx`: a kind with a registered
 * presentation renders it, everything else falls through to `GenericRenderer`,
 * the guaranteed default-path floor. Never assume a kind instance is keyword
 * research.
 *
 * Metrics: the artifact stores phrases only, and anonymous visitors cannot read
 * the keyword plane, so the market rows come from the token-scoped
 * `share_token_keyword_metrics` RPC (see data/shared-metrics.ts).
 */

import { useQuery } from "@tanstack/react-query";

import KeywordResearchReport from "@/features/marketing/seo/keyword-research/components/KeywordResearchReport";
import { readKeywordResearchArtifact } from "@/features/marketing/seo/keyword-research/data/artifact";
import {
  fetchSharedKeywordMetrics,
  sharedKeywordMetricsQueryKey,
} from "@/features/marketing/seo/keyword-research/data/shared-metrics";
import { GenericRenderer } from "@/features/sharing/lenses/default-renderers";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

function SharedKeywordResearch({
  artifact,
  createdAt,
  token,
}: {
  artifact: KeywordResearchArtifact;
  createdAt: string | null;
  token: string;
}) {
  const metrics = useQuery({
    queryKey: sharedKeywordMetricsQueryKey(token),
    queryFn: () => fetchSharedKeywordMetrics(token),
  });

  return (
    <KeywordResearchReport
      artifact={artifact}
      keywords={metrics.data ?? []}
      generatedAt={createdAt}
      acquisition
    />
  );
}

export function KindInstanceRenderer({
  result,
  token,
}: {
  result: ResolvedShareToken;
  token: string;
}) {
  const artifact = readKeywordResearchArtifact(result.resource?.["data"]);
  if (!artifact) return <GenericRenderer result={result} />;
  const createdAt = result.resource?.["created_at"];
  return (
    <SharedKeywordResearch
      artifact={artifact}
      createdAt={typeof createdAt === "string" ? createdAt : null}
      token={token}
    />
  );
}
