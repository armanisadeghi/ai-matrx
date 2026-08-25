"use client";

/**
 * The keyword-meaning APPROVAL QUEUE — what an agent proposed, waiting on you.
 *
 * P12 (VISION.md § Determinism): agents may only SUGGEST changes to matchers,
 * worth, stamps and the guidelines document; every suggestion is shown here to
 * approve or reject, and an unapproved suggestion is invisible to the next run.
 *
 * ONE chip primitive, never a fork. The collapsed row IS the canonical
 * `<AssistStrip>` → `AssistChip` → `AssistCard`, so per-item approve/reject
 * already obeys THE INTENTIONAL-ACTION LAW (hover expands, only a verb button
 * runs). This component adds exactly one thing the chip row cannot give: reach
 * over the WHOLE queue — select-all, and one confirmed batch.
 *
 * 🚨 WHY A BATCH IS ALLOWED HERE. `features/assists/FEATURE.md` refuses bulk
 * ACCEPT in `/assists`, because there one click would fire N unlike actions the
 * user never read. Neither is true here: the list is open on screen BEFORE
 * anything can be selected, every row states the exact write in its own words
 * (`describeKeywordMeaningProposal().writePath`), the confirm dialog re-lists
 * every one of them, and each item still runs through the same single-item
 * handler with its own ledger receipt. Individual AND all — never forced.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import {
  fetchMyAssists,
  selectAssistsForSurface,
  selectAssistsLoaded,
} from "@/features/assists/redux/assistsSlice";
import { useAssistRunner } from "@/features/assists/runtime/useAssistRunner";
import { getAssistActionTextEditor } from "@/features/assists/runtime/action-editing";
import type { Assist } from "@/features/assists/types";
import {
  PROPOSAL_KIND_LABEL,
  describeKeywordMeaningProposal,
  type KeywordMeaningProposalKind,
} from "./proposal";

/**
 * The surface every keyword-meaning suggestion is addressed to. Written by
 * `seo.keyword_meaning_suggest`; changing it here means changing it there.
 */
export const KEYWORD_MEANING_SURFACE = "matrx-user/keyword-meaning-review";

/**
 * Is this row a keyword-meaning suggestion for THIS site — and, when the host
 * surface owns only one kind of proposal, for that kind?
 *
 * `kinds` exists so a single-subject screen (the Business guidelines editor)
 * can show its own queue without a matcher proposal appearing next to a
 * document, and without forking a second approval component to do it. Omit it
 * and the queue is the whole site's, exactly as before.
 */
function isForSite(
  assist: Assist,
  siteId: string,
  kinds?: readonly KeywordMeaningProposalKind[],
): boolean {
  return (
    assist.action.kind === "apply_keyword_meaning" &&
    assist.action.siteId === siteId &&
    (kinds === undefined || kinds.includes(assist.action.proposal.proposal))
  );
}

interface Row {
  assist: Assist;
  kind: KeywordMeaningProposalKind;
  headline: string;
  writePath: string;
  agent: string | null;
  requiresIndividualReview: boolean;
}

function toRows(assists: Assist[]): Row[] {
  return assists.flatMap((assist) => {
    if (assist.action.kind !== "apply_keyword_meaning") return [];
    const { proposal, provenance } = assist.action;
    const described = describeKeywordMeaningProposal(proposal);
    return [
      {
        assist,
        kind: proposal.proposal,
        headline: described.headline,
        writePath: described.writePath,
        agent: provenance.agentName ?? null,
        requiresIndividualReview:
          getAssistActionTextEditor(assist.action) !== null,
      },
    ];
  });
}

export function KeywordMeaningSuggestions({
  siteId,
  kinds,
  className,
}: {
  siteId: string;
  /** Narrow the queue to one subject; omit for the whole site's queue. */
  kinds?: readonly KeywordMeaningProposalKind[];
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const loaded = useAppSelector(selectAssistsLoaded);
  const surfaceAssists = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, KEYWORD_MEANING_SURFACE),
  );
  const { acceptAssist, dismissAssist } = useAssistRunner();

  // Hydrate the shared slice ourselves. `AssistStrip` does this too, but it is
  // rendered INSIDE this panel — and the panel renders nothing when it has no
  // rows, so waiting for the strip would mean the queue never loads on a page
  // where the deferred global dock has not mounted.
  useEffect(() => {
    if (userId && !loaded) void dispatch(fetchMyAssists({ userId }));
  }, [dispatch, userId, loaded]);

  const rows = useMemo(
    () => toRows(surfaceAssists.filter((a) => isForSite(a, siteId, kinds))),
    [surfaceAssists, siteId, kinds],
  );

  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<Row[] | null>(null);

  const chipFilter = useMemo(
    () => (assist: Assist) => isForSite(assist, siteId, kinds),
    [siteId, kinds],
  );

  if (rows.length === 0) return null;

  const selectableRows = rows.filter((row) => !row.requiresIndividualReview);
  const selectedRows = selectableRows.filter((row) =>
    selected.has(row.assist.id),
  );
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(
      allSelected
        ? new Set()
        : new Set(selectableRows.map((row) => row.assist.id)),
    );
  };

  const runApprovals = async (batch: Row[]) => {
    setBusy(true);
    let applied = 0;
    const failures: string[] = [];
    // Sequential on purpose: each approval is a real domain write, and two of
    // them racing on the same value would make the receipt order a lie.
    for (const row of batch) {
      const outcome = await acceptAssist(row.assist);
      if (outcome.ok) applied += 1;
      else failures.push(row.headline);
    }
    setBusy(false);
    setSelected(new Set());
    if (applied > 0) {
      toast.success(
        `Approved ${applied} suggestion${applied === 1 ? "" : "s"}.`,
      );
    }
    if (failures.length > 0) {
      // acceptAssist has already toasted each failure with its own reason;
      // this only says how much of the batch did not land.
      toast.error(
        `${failures.length} could not be applied and ${failures.length === 1 ? "is" : "are"} still waiting for you.`,
      );
    }
  };

  const confirmApprove = async (batch: Row[]) => {
    const ok = await confirm({
      title: `Approve ${batch.length} suggestion${batch.length === 1 ? "" : "s"}?`,
      description: (
        <span className="block space-y-2">
          <span className="block">
            This makes {batch.length === 1 ? "this change" : "these changes"} to
            how your keywords are read:
          </span>
          <span className="block max-h-56 space-y-1.5 overflow-y-auto overscroll-contain rounded-md border border-border bg-muted/40 p-2">
            {batch.map((row) => (
              <span key={row.assist.id} className="block text-xs">
                <span className="font-medium text-foreground">
                  {row.headline}
                </span>
                <span className="block text-muted-foreground">
                  {row.writePath}
                </span>
              </span>
            ))}
          </span>
        </span>
      ),
      confirmLabel: `Approve ${batch.length}`,
    });
    if (ok) await runApprovals(batch);
  };

  const runRejections = async (batch: Row[], reason: string) => {
    setBusy(true);
    for (const row of batch) {
      await dismissAssist(row.assist, reason);
    }
    setBusy(false);
    setSelected(new Set());
    toast.success(
      `Rejected ${batch.length} suggestion${batch.length === 1 ? "" : "s"}. The same suggestion will not come back.`,
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          Suggested by your agents
        </span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
          {rows.length}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Nothing here affects a single keyword until you approve it.
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          {expanded ? "Hide the list" : `Review all ${rows.length}`}
        </Button>
      </div>

      {/* The canonical chip row — per-item approve/reject through the one card. */}
      <AssistStrip
        surfaceName={KEYWORD_MEANING_SURFACE}
        filter={chipFilter}
        className="mt-2"
      />

      {expanded && (
        <div className="mt-3 border-t border-border pt-2.5">
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label="Select every suggestion"
              disabled={busy || selectableRows.length === 0}
            />
            <span className="text-xs text-muted-foreground">
              {selectedRows.length > 0
                ? `${selectedRows.length} of ${rows.length} selected`
                : selectableRows.length > 0
                  ? "Select all one-click suggestions"
                  : "Text changes are reviewed individually"}
            </span>
            {selectedRows.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={busy}
                  onClick={() => void confirmApprove(selectedRows)}
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Approve {selectedRows.length}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={busy}
                  onClick={() => setRejecting(selectedRows)}
                >
                  <X className="size-3.5" />
                  Reject {selectedRows.length}
                </Button>
              </div>
            )}
          </div>

          <ul className="space-y-1">
            {rows.map((row) => (
              <li
                key={row.assist.id}
                className="flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(row.assist.id)}
                  onCheckedChange={() => toggle(row.assist.id)}
                  aria-label={`Select: ${row.headline}`}
                  disabled={busy || row.requiresIndividualReview}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] font-normal"
                    >
                      {PROPOSAL_KIND_LABEL[row.kind]}
                    </Badge>
                    <span className="text-sm text-foreground">
                      {row.headline}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.writePath}
                    {row.agent ? ` · suggested by ${row.agent}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {row.requiresIndividualReview ? (
                    <span className="max-w-24 text-right text-[11px] leading-tight text-muted-foreground">
                      Review guidelines in its chip
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      disabled={busy}
                      onClick={() => void confirmApprove([row])}
                    >
                      Approve
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() => setRejecting([row])}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TextInputDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        title={
          rejecting && rejecting.length > 1
            ? `Reject ${rejecting.length} suggestions`
            : "Reject this suggestion"
        }
        description="Say why in a sentence. The reason is kept with the rejection, and this exact suggestion will never be proposed again — so the agents stop spending on it."
        placeholder="Why this is wrong for your business…"
        multiline
        rows={3}
        confirmLabel="Reject"
        busy={busy}
        onConfirm={async (reason) => {
          const batch = rejecting ?? [];
          setRejecting(null);
          await runRejections(batch, reason.trim());
        }}
      />
    </div>
  );
}
