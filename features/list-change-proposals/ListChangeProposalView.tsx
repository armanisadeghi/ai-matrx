"use client";

/**
 * ListChangeProposalView — THE ONE component for `list_change_proposal_v1`
 * ("a shape has exactly ONE component"). Chat renders it through the compiled
 * kind bridge; any other host that has a proposal set renders THIS, never a
 * second reviewer.
 *
 * ONE ROW PER PROPOSAL: what changes, why, Accept, Reject. Nothing is folded
 * behind a disclosure, because a person deciding needs every line at once, and
 * nothing restates the list — the agent is taught to send only the delta.
 *
 * THREE THINGS IT REFUSES TO FAKE:
 *  1. A control that would do nothing is ABSENT with the reason in words. No
 *     message id → decisions cannot be remembered, so it says so. A store that
 *     refuses to be read → the proposals still render, read-only, carrying the
 *     store's own sentence.
 *  2. The store's answer is shown verbatim. "Applied", "already there" and a
 *     refusal are three different sentences, and the refusal is the store's,
 *     not a paraphrase.
 *  3. Accepting a removal DESTROYS the row — `udt_bulk_write` issues a real
 *     DELETE — so the confirm says exactly that rather than "cannot be undone".
 *
 * STATE AFTER A RELOAD comes from two places on purpose: what the store now
 * says (an accepted add is settled because the row is THERE) and what the
 * person decided (`chat.message.metadata`, so a rejection and a refusal
 * sentence survive too). See `decisions.ts`.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CircleSlash,
  Info,
  ListChecks,
  Loader2,
  Minus,
  PencilLine,
  Plus,
} from "lucide-react";

import { Button } from "@ai-matrx/design-system";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type {
  ListChangeProposalItem,
  ListChangeProposalValue,
} from "@/features/content-ir/kinds/list-change-proposal";

import {
  applyListChange,
  proposalStanding,
  readListTarget,
  type ApplyOutcome,
  type ListSnapshot,
} from "./applyListChange";
import {
  fetchProposalDecisions,
  recordProposalDecision,
  type ProposalDecision,
  type ProposalDecisions,
} from "./decisions";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ListChangeProposalViewProps {
  proposal: ListChangeProposalValue;
  /**
   * The assistant message these proposals were drawn in. Without it the
   * decisions have nowhere durable to live, and the component SAYS SO rather
   * than offering buttons whose result evaporates.
   */
  messageId?: string | null;
  /** A record-only viewer, or a host with no writes. Controls are ABSENT. */
  readOnly?: boolean;
  density?: "compact" | "comfortable";
  className?: string;
}

const ACTION_ICON = {
  add: Plus,
  remove: Minus,
  update: PencilLine,
} as const;

const ACTION_WORD = {
  add: "Add",
  remove: "Remove",
  update: "Update",
} as const;

const NO_MESSAGE_REASON =
  "These proposals are not attached to a saved message, so a decision could not be remembered after a reload. Open this conversation from its own page to decide on them.";

function outcomeSentence(outcome: ApplyOutcome): string {
  return outcome.detail;
}

export function ListChangeProposalView({
  proposal,
  messageId = null,
  readOnly = false,
  density = "compact",
  className,
}: ListChangeProposalViewProps) {
  const { target, summary, proposals, unreadable } = proposal;

  const [snapshot, setSnapshot] = useState<ListSnapshot | null>(null);
  const [readRefusal, setReadRefusal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<ProposalDecisions>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    { scope: "one"; item: ListChangeProposalItem } | { scope: "all" } | null
  >(null);

  const refreshStore = useCallback(async () => {
    const read = await readListTarget(target);
    if (read.status === "read") {
      setSnapshot(read.snapshot);
      setReadRefusal(null);
    } else {
      setSnapshot(null);
      setReadRefusal(read.detail);
    }
  }, [target]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void (async () => {
      const [, storedDecisions] = await Promise.all([
        refreshStore(),
        messageId ? fetchProposalDecisions(messageId) : Promise.resolve({}),
      ]);
      if (!live) return;
      setDecisions(storedDecisions);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [refreshStore, messageId]);

  const canDecide = !readOnly && Boolean(messageId) && readRefusal === null;

  const remember = useCallback(
    async (id: string, decision: ProposalDecision) => {
      setDecisions((prev) => ({ ...prev, [id]: decision }));
      if (!messageId) return;
      const result = await recordProposalDecision(messageId, id, decision);
      if (result.status === "not_remembered") {
        toast.error(
          `The change went through, but ${result.why} — it may be offered again.`,
        );
      }
    },
    [messageId],
  );

  const runAccept = useCallback(
    async (item: ListChangeProposalItem) => {
      setBusyId(item.id);
      try {
        const outcome = await applyListChange(target, item);
        await remember(item.id, {
          decision: "accepted",
          at: new Date().toISOString(),
          outcome: outcome.status,
          detail: outcomeSentence(outcome),
        });
        if (outcome.status === "refused") toast.error(outcome.detail);
        await refreshStore();
      } finally {
        setBusyId(null);
      }
    },
    [target, remember, refreshStore],
  );

  const runReject = useCallback(
    async (item: ListChangeProposalItem) => {
      setBusyId(item.id);
      try {
        await remember(item.id, {
          decision: "rejected",
          at: new Date().toISOString(),
        });
      } finally {
        setBusyId(null);
      }
    },
    [remember],
  );

  const openProposals = proposals.filter((p) => {
    if (decisions[p.id]) return false;
    if (!snapshot) return true;
    return proposalStanding(snapshot, p) === "open";
  });
  const openRemovals = openProposals.filter((p) => p.action === "remove");

  const runAcceptAll = useCallback(async () => {
    for (const item of openProposals) {
      // Sequential on purpose: each write is a separate authority check and a
      // separate honest answer, and a batch that half-applies must still be
      // readable line by line.
      // eslint-disable-next-line no-await-in-loop
      await runAccept(item);
    }
  }, [openProposals, runAccept]);

  const runRejectAll = useCallback(async () => {
    for (const item of openProposals) {
      // eslint-disable-next-line no-await-in-loop
      await runReject(item);
    }
  }, [openProposals, runReject]);

  const listLabel = target.label ?? snapshot?.label ?? "this list";

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2.5", className)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden />
          Proposed changes
        </span>
        <span className="text-xs text-muted-foreground">
          {listLabel} · {proposals.length} change{proposals.length === 1 ? "" : "s"}
          {snapshot ? ` · ${snapshot.rows.length} on the list now` : ""}
        </span>
      </header>

      {summary ? <p className="text-sm text-foreground">{summary}</p> : null}

      {proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-3 text-sm">
          <p className="font-medium">Nothing to change</p>
          <p className="mt-1 text-muted-foreground">
            The agent looked at {listLabel} and proposed no additions or removals. An
            empty set is a real answer.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {proposals.map((item) => (
            <ProposalRow
              key={item.id}
              item={item}
              density={density}
              decision={decisions[item.id] ?? null}
              settledByStore={snapshot ? proposalStanding(snapshot, item) === "settled" : false}
              busy={busyId === item.id}
              canDecide={canDecide}
              loading={loading}
              onAccept={() =>
                item.action === "remove"
                  ? setPendingConfirm({ scope: "one", item })
                  : void runAccept(item)
              }
              onReject={() => void runReject(item)}
            />
          ))}
        </ul>
      )}

      {unreadable.length > 0 ? (
        <ul
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"
        >
          {unreadable.map((u, __i, __all) => (
            <li key={u.index}>
              Proposal {u.index + 1} was not shown because {u.why}.
            {__i === __all.length - 1 && <ErrorAlchemyMenu />}</li>
          ))}
        </ul>
      ) : null}

      {readRefusal ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-2 text-xs text-muted-foreground"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              These changes cannot be applied from here.{" "}
            </span>
            {readRefusal}
          </span>
          <ErrorAlchemyMenu />
        </p>
      ) : null}

      {!messageId && !readOnly && !readRefusal ? (
        <p className="text-xs text-muted-foreground">{NO_MESSAGE_REASON}</p>
      ) : null}

      {canDecide && openProposals.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={busyId !== null}
            onClick={() =>
              openRemovals.length > 0
                ? setPendingConfirm({ scope: "all" })
                : void runAcceptAll()
            }
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Accept all {openProposals.length}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyId !== null}
            onClick={() => void runRejectAll()}
          >
            <CircleSlash className="h-3.5 w-3.5" aria-hidden />
            Reject all {openProposals.length}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={
          pendingConfirm?.scope === "all"
            ? `Apply ${openProposals.length} changes to ${listLabel}?`
            : `Remove this from ${listLabel}?`
        }
        description={
          pendingConfirm?.scope === "all"
            ? `${openRemovals.length} of these ${openProposals.length} changes DELETE a row outright — the row and its text are gone from ${listLabel}, not archived, and this cannot be undone. The rest add or edit rows.`
            : `This DELETES the row "${pendingConfirm?.scope === "one" ? pendingConfirm.item.title : ""}" outright — it is gone from ${listLabel}, not archived, and this cannot be undone.`
        }
        confirmLabel={pendingConfirm?.scope === "all" ? "Apply all" : "Remove"}
        variant="destructive"
        busy={busyId !== null}
        onConfirm={() => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          if (!pending) return;
          if (pending.scope === "all") void runAcceptAll();
          else void runAccept(pending.item);
        }}
      />
    </div>
  );
}

function ProposalRow({
  item,
  density,
  decision,
  settledByStore,
  busy,
  canDecide,
  loading,
  onAccept,
  onReject,
}: {
  item: ListChangeProposalItem;
  density: "compact" | "comfortable";
  decision: ProposalDecision | null;
  settledByStore: boolean;
  busy: boolean;
  canDecide: boolean;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const Icon = ACTION_ICON[item.action];
  const decided = decision !== null;

  return (
    <li
      className={cn(
        "flex items-start gap-2.5",
        density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2.5",
        decided ? "opacity-70" : "",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          item.action === "remove" ? "text-destructive" : "text-primary",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          <span className="font-medium">{ACTION_WORD[item.action]}:</span> {item.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
        {decision ? (
          <p className="mt-0.5 text-xs">
            <span
              className={cn(
                "font-medium",
                decision.decision === "rejected"
                  ? "text-muted-foreground"
                  : decision.outcome === "refused"
                    ? "text-destructive"
                    : "text-foreground",
              )}
            >
              {decision.decision === "rejected" ? "Rejected" : "Accepted"}
            </span>
            {decision.detail ? (
              <span className="text-muted-foreground"> — {decision.detail}</span>
            ) : null}
          </p>
        ) : settledByStore ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.action === "add"
              ? "Already on the list — accepting would change nothing."
              : "Already done — the row this names is no longer as described."}
          </p>
        ) : null}
      </div>

      {canDecide && !decided ? (
        <div className="flex shrink-0 items-center gap-1">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={onAccept}
                aria-label={`Accept: ${item.title}`}
                title="Accept"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={onReject}
                aria-label={`Reject: ${item.title}`}
                title="Reject"
              >
                <CircleSlash className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
