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
 * with the raw value in a code block — never nothing.
 */

import { MapTopicProposalView } from "@/features/marketing/seo/topical-map/proposals/MapTopicProposalView";
import { readMapTopicProposal } from "@/features/marketing/seo/topical-map/map-author";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
        <p className="mt-1 text-xs text-muted-foreground">
          The payload says it is a `map_topic_proposal_v1` but carries no `topics` list. The raw
          value is below so nothing is hidden.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(serverData.proposal, null, 2)}
        </pre>
        <ErrorAlchemyMenu className="ml-auto" />
      </div>
    );
  }

  return <MapTopicProposalView proposal={proposal} mapId={mapId} density="compact" />;
}
