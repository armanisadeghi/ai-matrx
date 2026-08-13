"use client";

/**
 * Owner-side host for a durable keyword-research artifact: loads the keyword
 * plane for the artifact's phrases and hands both to `KeywordResearchReport`,
 * the ONE rendering shared with the grantee permalink and the anonymous share
 * link. This file owns the client data load and the owner affordances (share);
 * it renders nothing itself.
 *
 * Selection is not passed down: the kind blocks inside the report source it
 * from the mounted surface (`keyword_selection` UI state + write target), so
 * the saved view and the live view behave identically with no duplicated
 * interaction wiring. See KeywordResearchBlock's header.
 */

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ShareButton } from "@/features/sharing/components/ShareButton";
import { listKeywordsWithMarketByPhrases } from "@/features/marketing/seo/keyword-research/data/queries";
import { keywordResearchPhrases } from "@/features/marketing/seo/keyword-research/data/artifact";
import type { KeywordResearchArtifact } from "@/types/python-generated/stream-events";

import KeywordResearchReport from "./KeywordResearchReport";

export interface SavedResearchFeedProps {
  artifact: KeywordResearchArtifact;
  /**
   * The `content_ir.kind_instance` id this artifact was loaded from. Present
   * ⇒ the artifact is a real, addressable, SHAREABLE record, so the feed shows
   * its doors (open the full report, share it). Absent ⇒ the artifact came off
   * a live run result and has no permalink yet.
   */
  instanceId?: string | null;
}

export default function SavedResearchFeed({
  artifact,
  instanceId,
}: SavedResearchFeedProps) {
  const phrases = keywordResearchPhrases(artifact);
  const classifications = useQuery({
    queryKey: ["seo", "keyword-research", "classifications", ...phrases],
    queryFn: ({ signal }) => listKeywordsWithMarketByPhrases(phrases, signal),
    enabled: phrases.length > 0,
  });

  return (
    <div className="space-y-2">
      {instanceId ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/shapes/instances/${instanceId}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open full report
          </Link>
          <ShareButton
            resourceType="content_ir_kind_instance"
            resourceId={instanceId}
            resourceName={`Keyword research: ${artifact.primary_keyword}`}
            size="sm"
            variant="outline"
          />
        </div>
      ) : null}
      {classifications.isLoading ? (
        <div className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : null}
      <KeywordResearchReport
        artifact={artifact}
        keywords={classifications.data ?? []}
        variant="embedded"
      />
    </div>
  );
}
