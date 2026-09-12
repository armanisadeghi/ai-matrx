"use client";

/**
 * ProposedDirectivesZone — the approve/decline cards for agent-proposed actions
 * (the `ask` apply policy). Renders one card per pending proposal for a
 * conversation; Approve POSTs the round-tripped two-key shell to `/directives/confirm`
 * (`confirmDirective`, runs as the user under RLS), Decline just dismisses it.
 *
 * Mounted beside the chat input (next to `PendingAsksZone`). Mirrors the visual
 * language of the agent-action ApprovalCard without coupling to the tool-suspend
 * rail — a proposed directive is a terminal side effect, not a suspended call.
 *
 * 🚨 THE CARD DOES NOT VANISH WHEN YOU CLICK IT (V-19, 2026-09-12). It used to:
 * Approve POSTed, the card was removed, and the only thing left was a four-second
 * toast the client composed from counts — `Applied ${title}: ${result.applied}
 * done` — which is the exact client-composed-from-counts line DD-118 exists to
 * kill, standing on the one path a human actually takes (the org gate makes
 * `ask` the normal outcome, so this card IS the flow). Verified on production:
 * the project was written and the chat said nothing.
 *
 * Now the card that asked "shall I?" answers "here is what happened", in place,
 * in the SERVER's words (the confirm result's per-item receipt `message` values,
 * composed by aidream's `receipt_words.py`). Nothing here is counted, pluralized
 * or phrased.
 */

import { useEffect, useRef, useState } from "react";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ListChecks,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { directiveDisplay, isDirectiveClass } from "@ai-matrx/content-ir";
import { matrxDirectiveNouns } from "@/features/matrx-envelope/directiveHost";
import { confirmDirective } from "@/features/directive-catalog/service";
import type { DirectiveConfirmRequest } from "@/features/directive-catalog/types";
import {
  removeProposal,
  resolveProposal,
  selectProposedDirectives,
  type ProposedDirective,
} from "@/features/matrx-envelope/state/proposedDirectivesSlice";
import { BackendApiError } from "@/lib/api/errors";
import {
  fetchConversationReceipts,
  type ConversationDirectiveReceipt,
} from "@/features/matrx-envelope/conversationReceipts";
import DirectiveReceiptBlock from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProposedDirectivesZoneProps {
  conversationId: string;
}

export function ProposedDirectivesZone({
  conversationId,
}: ProposedDirectivesZoneProps) {
  const proposals = useAppSelector(selectProposedDirectives(conversationId));
  const { receipts, loadError } = useConversationReceipts(conversationId);

  if (proposals.length === 0 && receipts.length === 0 && !loadError) return null;
  return (
    <div className="flex flex-col gap-2">
      {/* NOTHING SILENT: "no receipts" and "we could not look" must not render
          the same. The sentence is the reader's, with the reason. */}
      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-card px-3 py-2 text-xs text-destructive">
          {loadError}
        </div>
      )}
      {receipts.map((r) => (
        <DirectiveReceiptBlock
          key={r.ledgerKey}
          directive={r.directive}
          outcome="applied"
          message={r.message}
        />
      ))}
      {proposals.map((p) => (
        <ProposedDirectiveCard key={p.proposalId} proposal={p} />
      ))}
    </div>
  );
}

/**
 * The conversation's already-applied directives, read ONCE per conversation from
 * the ledger. Once, deliberately: a confirm made later in this session is shown
 * by its own card, and re-reading would render the same apply twice.
 */
function useConversationReceipts(conversationId: string) {
  const [receipts, setReceipts] = useState<ConversationDirectiveReceipt[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReceipts([]);
    setLoadError(null);
    if (!conversationId) return;
    void fetchConversationReceipts(conversationId)
      .then((rows) => {
        if (!cancelled) setReceipts(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load what this conversation's actions did.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return { receipts, loadError };
}

function ProposedDirectiveCard({ proposal }: { proposal: ProposedDirective }) {
  const dispatch = useAppDispatch();
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [busy, setBusy] = useState(false);
  // 🚨 A REF, NOT JUST `busy` (V-24, live 2026-09-12). `disabled={busy}` is a
  // render away: two clicks inside one React tick both run `onApprove` before
  // the re-render disables anything, and the verifier's double-click sent two
  // POSTs that wrote two projects. The ref closes the window synchronously, in
  // the same tick as the click. It is NECESSARY AND NOT SUFFICIENT — the fix is
  // the server's claim under the ledger's primary key (aidream round 3); this
  // only stops the client asking twice.
  const inFlight = useRef(false);

  // The slug's class + noun ARE the title — derived from the one identity, so
  // the card can never name the action differently from what it will apply,
  // and the catalog supplies the human label ("Create Agent", not "create agent").
  const title = isDirectiveClass(proposal.directiveClass)
    ? directiveDisplay(proposal.directiveClass, proposal.noun, matrxDirectiveNouns).title
    : proposal.directive;
  const itemLabel = `${proposal.itemCount} item${proposal.itemCount === 1 ? "" : "s"}`;

  // THE CONSEQUENCE, NAMED BEFORE THE CLICK (DD-118). The server composed this
  // sentence from the directive it is holding; the card shows it verbatim so
  // Approve is never a button whose effect the user has to infer from a title.

  const dismiss = () =>
    dispatch(
      removeProposal({
        conversationId: proposal.conversationId,
        proposalId: proposal.proposalId,
      }),
    );

  const onApprove = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const body: DirectiveConfirmRequest = {
      directive: proposal.directive,
      items: (proposal.shell.items ?? []) as Record<string, unknown>[],
      proposal_id: proposal.proposalId,
      force: false,
      // THE IDEMPOTENCY NAMESPACE, not decoration. Without it the server keys
      // the write on a per-request uuid, so a second Approve writes a second
      // project and "Already applied" can never be reached on this path
      // (aidream c64f53507). 🚨 `api-types.ts` is generated from the aidream
      // CHECKOUT's contract (never from the live server; `pnpm sync-types`
      // refuses a server behind the pin) and carries this field — never delete
      // it to satisfy a stale server; `check:api-types-fresh` guards the file.
      conversation_id: proposal.conversationId,
    };
    try {
      const result = await confirmDirective(baseUrl, body);
      // The SERVER's sentence, verbatim. Not `result.applied` counted into a
      // line here — the client does not know whether the ledger replayed, what
      // the write-tree touched, or what the handler called it.
      const replayed = result.receipts.some(
        (r) => "status" in r && r.status === "already_applied",
      );
      dispatch(
        resolveProposal({
          conversationId: proposal.conversationId,
          proposalId: proposal.proposalId,
          outcome:
            result.failed > 0 && result.applied === 0
              ? "failed"
              : replayed
                ? "already_applied"
                : "applied",
          // NOTHING SILENT: a server build from before DD-118 answers without a
          // sentence. Say so, with the remedy — never render an empty receipt,
          // and never invent the words here.
          outcomeMessage:
            result.message ||
            result.receipts.map((receipt) => receipt.message).join("\n") ||
            "This was applied, but this server build did not send the receipt — " +
              "update the backend to see what was created.",
        }),
      );
    } catch (err) {
      const message =
        err instanceof BackendApiError
          ? err.userMessage
          : err instanceof Error
            ? err.message
            : "That couldn't be applied just now. Please try again.";
      toast.error(message);
      inFlight.current = false;
      setBusy(false);
    }
  };

  // THE RECEIPT STATE — the same card, answering instead of asking.
  if (proposal.outcome) {
    const done = proposal.outcome === "applied";
    const replayed = proposal.outcome === "already_applied";
    const OutcomeIcon = done
      ? CheckCircle2
      : replayed
        ? RotateCcw
        : AlertTriangle;
    const tone = done
      ? "text-primary"
      : replayed
        ? "text-muted-foreground"
        : "text-destructive";
    return (
      <div
        className="rounded-lg border border-border bg-card p-3 shadow-sm"
        data-directive={proposal.directive}
        data-outcome={proposal.outcome}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <OutcomeIcon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{title}</div>
              {/* The server's sentence for what happened. Verbatim. */}
              <div className="whitespace-pre-line text-xs text-muted-foreground">
                {proposal.outcomeMessage}
              </div>
            </div>
          </div>
          <Badge variant={done ? "default" : "secondary"} className="shrink-0">
            {done ? "Done" : replayed ? "Already done" : "Failed"}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {title}
            </div>
            {/* The server's sentence, verbatim. `summary` is the machine line
                (`directive_v1_… (1 item)`) and is the fallback only. */}
            <div className="text-xs text-muted-foreground">
              {proposal.message ||
                proposal.summary ||
                `${proposal.directive} (${itemLabel})`}
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
        <Button
          size="sm"
          onClick={onApprove}
          disabled={busy}
          aria-busy={busy}
          data-approve-state={busy ? "applying" : "idle"}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {/* The PENDING STATE says what is happening, so a click that looks
              like it did nothing is never mistaken for one that did. */}
          {busy ? "Applying…" : "Approve"}
        </Button>
      </div>
    </div>
  );
}
