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
 * A payload the reader refuses renders an honest notice over the generic
 * structured floor — never nothing, never a raw JSON dump.
 */

import { ListChangeProposalView } from "@/features/list-change-proposals/ListChangeProposalView";
import { readListChangeProposal } from "@/features/content-ir/kinds/list-change-proposal";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";

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
        {/* The kind's broken state: what arrived, drawn by the generic
            structured floor (its raw data one explicit click away) — never a
            raw JSON dump (Arman, 2026-09-30). */}
        <StructuredValueView
          className="mt-2"
          value={serverData.proposal}
          kind="list_change_proposal_v1"
          note="could not be read"
        />
        <ErrorAlchemyMenu className="ml-auto" />
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
