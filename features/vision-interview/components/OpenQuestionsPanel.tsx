"use client";

// features/vision-interview/components/OpenQuestionsPanel.tsx
//
// The right pane — the room's instrument panel: the living Open Questions
// ledger + the Adversary's holes. Dense, hierarchical, semantic-token only
// (war-room bar): sticky section headers with live counts, compact rows with
// a left state rail instead of boxed cards, controls quiet until hover.
//
//   Questions — state chip, age in ROUNDS (older = louder, strongest past 3),
//   dodge-count badge when > 1, missing-part callout for partials,
//   defer / reopen controls.
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
  ListTodo,
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
  composerInsertRequested,
  holeForced,
  holeMerged,
  questionForced,
  questionMerged,
  selectHolesOrdered,
  selectOpenHoleCount,
  selectOpenQuestionCount,
  selectQuestionsOrdered,
  selectRoomHydrated,
  selectRoomSession,
} from "../redux/vision-interview.slice";
import {
  acceptHoleAsRisk,
  reclassifyHole,
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

// ── Question row ────────────────────────────────────────────────────────────

const STATE_CHIP: Record<QuestionState, string> = {
  open: "border-border bg-muted text-foreground",
  answered: "border-border bg-muted text-muted-foreground",
  partially_answered: "border-primary/40 bg-primary/10 text-primary",
  dodged: "border-destructive/40 bg-destructive/10 text-destructive",
  deferred: "border-border bg-background text-muted-foreground",
};

/** Left rail color — the row's one-glance state. */
const STATE_RAIL: Record<QuestionState, string> = {
  open: "bg-border",
  answered: "bg-border/50",
  partially_answered: "bg-primary/50",
  dodged: "bg-destructive/60",
  deferred: "bg-border/50",
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
  const settled = !isLive;
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
        "group relative rounded-md py-1.5 pl-3 pr-2 hover:bg-accent/40",
        settled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "absolute bottom-1 left-0 top-1 w-0.5 rounded-full",
          loud ? "bg-destructive" : STATE_RAIL[question.state],
        )}
        aria-hidden
      />
      <p
        className={cn(
          "text-[13px] leading-snug text-foreground",
          loud && "font-medium",
        )}
      >
        {question.question}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium",
            STATE_CHIP[question.state],
          )}
        >
          {QUESTION_STATE_LABELS[question.state]}
        </span>
        {isLive && (
          <span
            className={cn(
              "text-[10px]",
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
          <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
            dodged ×{question.dodge_count}
          </Badge>
        )}
        {raisedBy && (
          <span className="text-[10px] text-muted-foreground">
            raised by {raisedBy}
          </span>
        )}
        {isLive && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-[11px] text-primary hover:text-primary"
            onClick={() =>
              dispatch(
                composerInsertRequested({
                  text: `**Q:** ${question.question}\n**A:** `,
                }),
              )
            }
            title="Answer this question in the composer — it sends with your next turn"
          >
            Answer
          </Button>
        )}
        <span
          className={cn(
            "inline-flex opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
            !isLive && "ml-auto",
          )}
        >
          {question.state === "deferred" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px]"
              disabled={busy}
              onClick={() => void setState("open")}
            >
              Reopen
            </Button>
          ) : isLive ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[11px]"
              disabled={busy}
              onClick={() => void setState("deferred")}
            >
              Defer
            </Button>
          ) : null}
        </span>
      </div>
      {question.state === "partially_answered" && question.missing_part && (
        <p className="mt-1 rounded border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] text-foreground">
          <CircleHelp
            className="mr-1 inline h-3 w-3 text-primary"
            aria-hidden
          />
          Still missing: {question.missing_part}
        </p>
      )}
      {question.answer_note && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {question.answer_note}
        </p>
      )}
    </div>
  );
}

// ── Hole row ────────────────────────────────────────────────────────────────

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
  const settled = hole.status === "patched" || hole.status === "accepted_risk";

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
        "group relative rounded-md py-1.5 pl-3 pr-2",
        needsArbitration
          ? "border border-destructive/40 bg-destructive/5"
          : "hover:bg-accent/40",
        settled && "opacity-60",
      )}
    >
      {!needsArbitration && (
        <span
          className={cn(
            "absolute bottom-1 left-0 top-1 w-0.5 rounded-full",
            hole.classification === "fatal"
              ? "bg-destructive/60"
              : hole.classification === "unknown"
                ? "bg-primary/50"
                : "bg-border",
          )}
          aria-hidden
        />
      )}
      {needsArbitration && (
        <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          Needs your call — the room deadlocked on this one
        </p>
      )}
      <p className="text-[13px] font-medium leading-snug text-foreground">
        {hole.claim_attacked}
      </p>
      {hole.why_it_breaks && (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {hole.why_it_breaks}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium",
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
        <span className="text-[10px] text-muted-foreground">
          {HOLE_STATUS_LABELS[hole.status]}
        </span>
        {hole.reclassified_by_human && (
          <span className="text-[10px] text-muted-foreground">
            reclassified by you
          </span>
        )}
        {hole.roundtrip_count > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {hole.roundtrip_count} round-trip
            {hole.roundtrip_count === 1 ? "" : "s"}
          </span>
        )}
        {!settled && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "ml-auto h-5 px-1.5 text-[11px]",
              !needsArbitration &&
                "opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
            )}
            disabled={busy}
            onClick={() => setConfirmRisk(true)}
          >
            Accept as risk
          </Button>
        )}
      </div>
      {hole.resolution && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {hole.resolution}
        </p>
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

function SectionHeader({
  icon: Icon,
  label,
  openCount,
  total,
}: {
  icon: typeof ListTodo;
  label: string;
  openCount: number;
  total: number;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-2 flex items-center gap-1.5 border-b border-border/60 bg-background/95 px-2.5 py-1.5 backdrop-blur">
      <Icon className="h-3 w-3 text-muted-foreground" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {total > 0 && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-px text-[10px] font-medium",
            openCount > 0
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {openCount} open · {total}
        </span>
      )}
    </div>
  );
}

export function OpenQuestionsPanel() {
  const questions = useAppSelector(selectQuestionsOrdered);
  const holes = useAppSelector(selectHolesOrdered);
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);
  const openQuestions = useAppSelector(selectOpenQuestionCount);
  const openHoles = useAppSelector(selectOpenHoleCount);
  const currentRound = session?.current_round ?? 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-2 pb-2">
      <SectionHeader
        icon={ListTodo}
        label="Open questions"
        openCount={openQuestions}
        total={questions.length}
      />
      {!hydrated ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : questions.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          No questions raised yet — the room files them here as it works.
        </p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} currentRound={currentRound} />
          ))}
        </div>
      )}

      <div className="pt-3">
        <SectionHeader
          icon={AlertTriangle}
          label="Holes"
          openCount={openHoles}
          total={holes.length}
        />
      </div>
      {!hydrated ? (
        <Skeleton className="mt-2 h-12 w-full" />
      ) : holes.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          The Adversary has not opened any holes.
        </p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {holes.map((h) => (
            <HoleCard key={h.id} hole={h} />
          ))}
        </div>
      )}
    </div>
  );
}
