"use client";

/**
 * ProposedDirectivesZone — the approve/decline cards for agent-proposed actions
 * (the `ask` apply policy). Renders one card per pending proposal for a
 * conversation; Approve POSTs the round-tripped envelope to `/actions/confirm`
 * (`confirmDirective`, runs as the user under RLS), Decline just dismisses it.
 *
 * Mounted beside the chat input (next to `PendingAsksZone`). Mirrors the visual
 * language of the agent-action ApprovalCard without coupling to the tool-suspend
 * rail — a proposed directive is a terminal side effect, not a suspended call.
 */

import { useState } from "react";

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { confirmDirective } from "@/features/action-catalog/service";
import type { DirectiveConfirmRequest } from "@/features/action-catalog/types";
import {
  removeProposal,
  selectProposedDirectives,
  type ProposedDirective,
} from "@/features/matrx-envelope/state/proposedDirectivesSlice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProposedDirectivesZoneProps {
  conversationId: string;
}

export function ProposedDirectivesZone({ conversationId }: ProposedDirectivesZoneProps) {
  const proposals = useAppSelector(selectProposedDirectives(conversationId));
  if (proposals.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {proposals.map((p) => (
        <ProposedDirectiveCard key={p.proposalId} proposal={p} />
      ))}
    </div>
  );
}

function ProposedDirectiveCard({ proposal }: { proposal: ProposedDirective }) {
  const dispatch = useAppDispatch();
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [busy, setBusy] = useState(false);

  const title =
    proposal.verb && proposal.noun
      ? `${proposal.verb} ${proposal.noun}`
      : proposal.type;
  const itemLabel = `${proposal.itemCount} item${proposal.itemCount === 1 ? "" : "s"}`;

  const dismiss = () =>
    dispatch(removeProposal({ conversationId: proposal.conversationId, proposalId: proposal.proposalId }));

  const onApprove = async () => {
    setBusy(true);
    const body: DirectiveConfirmRequest = {
      matrx_version: proposal.envelope.matrx_version,
      kind: "output_directive",
      type: proposal.type,
      items: proposal.envelope.items,
      proposal_id: proposal.proposalId,
    };
    try {
      const result = await confirmDirective(baseUrl, body);
      const failedSuffix = result.failed > 0 ? `, ${result.failed} failed` : "";
      if (result.failed > 0 && result.applied === 0) {
        toast.error(`Could not apply ${title}${failedSuffix}`);
      } else {
        toast.success(`Applied ${title}: ${result.applied} done${failedSuffix}`);
      }
      dismiss();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Confirm failed");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium capitalize text-foreground">{title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {proposal.summary ?? `${proposal.type} (${itemLabel})`}
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">
          Needs approval
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
          <X className="size-4" />
          Decline
        </Button>
        <Button size="sm" onClick={onApprove} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Approve
        </Button>
      </div>
    </div>
  );
}
