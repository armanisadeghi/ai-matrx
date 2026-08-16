"use client";

// features/vision-interview/components/OpenQuestionsPanel.tsx
//
// The right pane: the living Open Questions ledger + the Adversary's holes.
//
//   Questions — state chip (semantic tokens), age in ROUNDS (older = louder,
//   stronger treatment past 3 rounds), dodge-count badge when > 1, missing-part
//   callout for partials, defer / reopen controls.
//
//   Holes — needs_human_arbitration rows surface at the top with distinct
//   treatment (the selector orders them first), classification chip with a
//   human reclassify dropdown (provenance kept via reclassified_by_human),
//   and "Accept as risk" behind a ConfirmDialog (never window.confirm).
//
// All writes go through service.ts with optimistic merges; the realtime echo
// of our own write is dropped by the slice's timestamp-monotonic guard.

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleHelp,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  holeForced,
  holeMerged,
  questionForced,
  questionMerged,
  selectHolesOrdered,
  selectQuestionsOrdered,
  selectRoomHydrated,
  selectRoomSession,
} from "../redux/vision-interview.slice";
import {
  acceptHoleAsRisk,
  reclassifyHole,
  updateHole,
  updateQuestionState,
} from "../service";
import {
  HOLE_CLASSIFICATION_LABELS,
  HOLE_STATUS_LABELS,
  QUESTION_STATE_LABELS,
  ROLES,
  type HoleClassification,
  type InterviewHoleRow,
  type InterviewQuestionRow,
  type QuestionState,
  type RoleKey,
} from "../types";

// ── Question card ───────────────────────────────────────────────────────────

const STATE_CHIP: Record<QuestionState, string> = {
  open: "border-border bg-muted text-foreground",
  answered: "border-border bg-muted text-muted-foreground",
  partially_answered: "border-primary/40 bg-primary/10 text-primary",
  dodged: "border-destructive/40 bg-destructive/10 text-destructive",
  deferred: "border-border bg-background text-muted-foreground",
};

function QuestionCard({
  question,
  currentRound,
}: {
  question: InterviewQuestionRow;
  currentRound: number;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const age = Math.max(0, currentRound - question.round_raised);
  const isLive = question.state !== "answered" && question.state !== "deferred";
  const loud = isLive && age >= 3;
  const raisedBy =
    question.raised_by && question.raised_by !== "human"
      ? ROLES[question.raised_by as RoleKey]?.name
      : question.raised_by === "human"
        ? "You"
        : null;

  const setState = async (state: QuestionState) => {
    if (busy) return;
    setBusy(true);
    const prev = question;
    // Optimistic merge — the server row (and its realtime echo) supersedes it.
    dispatch(
      questionMerged({
        ...question,
        state,
        updated_at: new Date().toISOString(),
      }),
    );
    try {
      const saved = await updateQuestionState(question.id, state);
      dispatch(questionMerged(saved));
    } catch (err) {
      dispatch(questionForced(prev));
      toast.error(
        err instanceof Error ? err.message : "Could not update the question.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        loud
          ? "border-destructive/50 bg-destructive/5"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-1.5">
        <p
          className={cn(
            "min-w-0 flex-1 text-sm text-foreground",
            loud && "font-medium",
          )}
        >
          {question.question}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
            STATE_CHIP[question.state],
          )}
        >
          {QUESTION_STATE_LABELS[question.state]}
        </span>
        {isLive && (
          <span
            className={cn(
              "text-[11px]",
              loud
                ? "font-semibold text-destructive"
                : age >= 2
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {age === 0 ? "this round" : `${age} round${age === 1 ? "" : "s"} old`}
          </span>
        )}
        {question.dodge_count > 1 && (
          <Badge variant="destructive" className="px-1.5 py-0 text-[11px]">
            dodged ×{question.dodge_count}
          </Badge>
        )}
        {raisedBy && (
          <span className="text-[11px] text-muted-foreground">
            raised by {raisedBy}
          </span>
        )}
        <span className="ml-auto inline-flex gap-1">
          {question.state === "deferred" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => void setState("open")}
            >
              Reopen
            </Button>
          ) : isLive ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => void setState("deferred")}
            >
              Defer
            </Button>
          ) : null}
        </span>
      </div>
      {question.state === "partially_answered" && question.missing_part && (
        <p className="mt-1.5 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-foreground">
          <CircleHelp
            className="mr-1 inline h-3 w-3 text-primary"
            aria-hidden
          />
          Still missing: {question.missing_part}
        </p>
      )}
      {question.answer_note && (
        <p className="mt-1 text-xs text-muted-foreground">
          {question.answer_note}
        </p>
      )}
    </div>
  );
}

// ── Hole card ───────────────────────────────────────────────────────────────

const CLASSIFICATION_CHIP: Record<HoleClassification, string> = {
  fatal: "border-destructive/50 bg-destructive/10 text-destructive",
  unknown: "border-primary/40 bg-primary/10 text-primary",
  undecided: "border-border bg-muted text-foreground",
};

function HoleCard({ hole }: { hole: InterviewHoleRow }) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [confirmRisk, setConfirmRisk] = useState(false);

  const needsArbitration = hole.status === "needs_human_arbitration";
  const settled =
    hole.status === "patched" || hole.status === "accepted_risk";

  const applyPatch = async (
    optimistic: Partial<InterviewHoleRow>,
    run: () => Promise<InterviewHoleRow>,
  ) => {
    if (busy) return;
    setBusy(true);
    const prev = hole;
    dispatch(
      holeMerged({
        ...hole,
        ...optimistic,
        updated_at: new Date().toISOString(),
      }),
    );
    try {
      const saved = await run();
      dispatch(holeMerged(saved));
    } catch (err) {
      dispatch(holeForced(prev));
      toast.error(
        err instanceof Error ? err.message : "Could not update the hole.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reclassify = (classification: HoleClassification) =>
    applyPatch({ classification, reclassified_by_human: true }, () =>
      reclassifyHole(hole.id, classification),
    );

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        needsArbitration
          ? "border-destructive bg-destructive/5"
          : "border-border bg-card",
        settled && "opacity-70",
      )}
    >
      {needsArbitration && (
        <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          Needs your call — the room deadlocked on this one
        </p>
      )}
      <p className="text-sm font-medium text-foreground">
        {hole.claim_attacked}
      </p>
      {hole.why_it_breaks && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hole.why_it_breaks}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
                CLASSIFICATION_CHIP[hole.classification],
              )}
              title="Reclassify"
            >
              {HOLE_CLASSIFICATION_LABELS[hole.classification]}
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Reclassify as</DropdownMenuLabel>
            {(Object.keys(HOLE_CLASSIFICATION_LABELS) as HoleClassification[]).map(
              (c) => (
                <DropdownMenuItem
                  key={c}
                  disabled={c === hole.classification}
                  onSelect={() => void reclassify(c)}
                >
                  {HOLE_CLASSIFICATION_LABELS[c]}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-[11px] text-muted-foreground">
          {HOLE_STATUS_LABELS[hole.status]}
        </span>
        {hole.reclassified_by_human && (
          <span className="text-[11px] text-muted-foreground">
            reclassified by you
          </span>
        )}
        {hole.roundtrip_count > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {hole.roundtrip_count} round-trip{hole.roundtrip_count === 1 ? "" : "s"}
          </span>
        )}
        {!settled && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            disabled={busy}
            onClick={() => setConfirmRisk(true)}
          >
            Accept as risk
          </Button>
        )}
      </div>
      {hole.resolution && (
        <p className="mt-1 text-xs text-muted-foreground">{hole.resolution}</p>
      )}
      <ConfirmDialog
        open={confirmRisk}
        onOpenChange={setConfirmRisk}
        title="Accept this hole as a known risk?"
        description={`"${hole.claim_attacked}" stays in the record as an accepted risk — the room stops working on it.`}
        confirmLabel="Accept risk"
        variant="destructive"
        busy={busy}
        onConfirm={() => {
          setConfirmRisk(false);
          void applyPatch({ status: "accepted_risk" }, () =>
            acceptHoleAsRisk(hole.id),
          );
        }}
      />
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function OpenQuestionsPanel() {
  const questions = useAppSelector(selectQuestionsOrdered);
  const holes = useAppSelector(selectHolesOrdered);
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);
  const currentRound = session?.current_round ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2">
      <p className="px-0.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Open questions
      </p>
      {!hydrated ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : questions.length === 0 ? (
        <p className="px-0.5 text-sm text-muted-foreground">
          No questions raised yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              currentRound={currentRound}
            />
          ))}
        </div>
      )}

      <p className="flex items-center gap-1 px-0.5 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Holes
      </p>
      {!hydrated ? (
        <Skeleton className="h-14 w-full" />
      ) : holes.length === 0 ? (
        <p className="px-0.5 text-sm text-muted-foreground">
          The Adversary has not opened any holes.
        </p>
      ) : (
        <div className="space-y-1.5">
          {holes.map((h) => (
            <HoleCard key={h.id} hole={h} />
          ))}
        </div>
      )}
    </div>
  );
}
