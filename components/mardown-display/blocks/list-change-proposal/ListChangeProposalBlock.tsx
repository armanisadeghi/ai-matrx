"use client";

/**
 * ListChangeProposalBlock — the block-registry face of
 * `list_change_proposal_v1`.
 *
 * A THIN adapter, deliberately: the bridge in
 * `features/content-ir/kinds/list-change-proposal.ts` hands over the payload
 * verbatim, this narrows it through THE ONE reader (`readListChangeProposal`),
 * and renders THE ONE component (`ListChangeProposalView`). A second reviewer
 * drawn here would be the "a shape has exactly ONE component" defect.
 *
 * It passes the message id straight through, because that is where a decision
 * on these proposals is remembered.
 *
 * A payload the reader refuses renders an honest notice with the raw value —
 * never nothing.
 */

import { ListChangeProposalView } from "@/features/list-change-proposals/ListChangeProposalView";
import { readListChangeProposal } from "@/features/content-ir/kinds/list-change-proposal";

export interface ListChangeProposalBlockProps {
  serverData: Record<string, unknown>;
  messageId?: string;
}

export default function ListChangeProposalBlock({
  serverData,
  messageId,
}: ListChangeProposalBlockProps) {
  const value = readListChangeProposal(serverData.proposal);

  if (!value) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
      >
        <p className="font-medium text-destructive">
          These proposed changes could not be read
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The payload says it is a `list_change_proposal_v1` but carries no readable
          target and `proposals` list. The raw value is below so nothing is hidden.
        </p>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(serverData.proposal, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <ListChangeProposalView
      proposal={value}
      messageId={messageId ?? null}
      density="compact"
    />
  );
}
