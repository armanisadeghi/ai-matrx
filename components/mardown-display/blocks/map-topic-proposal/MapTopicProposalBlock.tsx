"use client";

/**
 * MapTopicProposalBlock — the block-registry face of `map_topic_proposal_v1`.
 *
 * A THIN adapter, deliberately: the bridge in
 * `features/content-ir/kinds/map-topic-proposal.ts` hands over the payload
 * verbatim plus any `map_id`, and this narrows it onto the typed
 * `MapTopicProposal` through the SAME reader the run client uses
 * (`parseAuthorTopicalMapResult`'s node reader, exported as
 * `readMapTopicProposal`), then renders THE ONE component
 * (`MapTopicProposalView`). A second proposal renderer here would be the
 * defect R12 names.
 *
 * A payload the reader refuses (no `topics` array) renders an honest notice
 * over the generic structured floor — never nothing, never a raw JSON dump.
 */

import { MapTopicProposalView } from "@/features/marketing/seo/topical-map/proposals/MapTopicProposalView";
import { readMapTopicProposal } from "@/features/marketing/seo/topical-map/map-author";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";

export interface MapTopicProposalBlockProps {
  serverData: Record<string, unknown>;
}

export default function MapTopicProposalBlock({ serverData }: MapTopicProposalBlockProps) {
  const proposal = readMapTopicProposal(serverData.proposal);
  const mapId = typeof serverData.map_id === "string" && serverData.map_id ? serverData.map_id : null;

  if (!proposal) {
    return (
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">
          This proposed map could not be read
        </p>
        {/* The kind's broken state: what arrived, drawn by the generic
            structured floor (its raw data one explicit click away) — never a
            raw JSON dump (Arman, 2026-09-30). */}
        <StructuredValueView
          className="mt-2"
          value={serverData.proposal}
          kind="map_topic_proposal_v1"
          note="could not be read"
        />
        <ErrorAlchemyMenu className="ml-auto" />
      </div>
    );
  }

  return <MapTopicProposalView proposal={proposal} mapId={mapId} density="compact" />;
}
