"use client";

// features/vision-interview/components/QuestionsPanel.tsx
//
// ROOM v3 — THE LEFT PANEL: what the room is asking YOU.
//
// Replaces OpenQuestionsPanel, which Arman rejected on sight: every question
// blended into every other one. Here each question is its own card
// (QuestionCard), the status is a word a human already knows — Open · Pending ·
// Answered · Dismissed — and answering happens in a real WindowPanel beside
// the room (AnswerQuestionWindow), never in a hand-rolled modal.
//
// THE ANSWER LOOP (contract, room v3): Answer → type/dictate → Save. Save does
// NOT send. It dispatches `answerDrafted(...)`; the card flips to Pending; the
// pending answers ride the user's NEXT message as one `<answered_questions>`
// block (the composer owns that half). So the Expert can burn down ten
// questions in a row and send once.
//
// The Adversary's HOLES ledger lives at the bottom of this panel. It was the
// only surface for `interview.hole` in the room, and a panel rename must never
// silently delete a working ledger — a hole that needs human arbitration is
// literally the room asking the Expert a question.
//
// Ordering: `selectQuestionsGroupedForStage` (current stage's category first),
// live questions above settled ones, settled folded into an accordion.

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ListTodo,
  ShieldAlert,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  answerDiscarded,
  holeForced,
  holeMerged,
  questionForced,
  questionMerged,
  selectHolesOrdered,
  selectOpenHoleCount,
  selectPendingAnswers,
  selectQuestionsGroupedForStage,
  selectRoomHydrated,
  selectRoomSession,
  selectRoomSessionId,
} from "../redux/vision-interview.slice";
import {
  acceptHoleAsRisk,
  reclassifyHole,
  updateQuestionState,
} from "../service";
import {
  HOLE_CLASSIFICATION_LABELS,
  HOLE_STATUS_LABELS,
  type HoleClassification,
  type InterviewHoleRow,
  type InterviewQuestionRow,
  type QuestionState,
} from "../types";
import { QuestionCard } from "./QuestionCard";

// The window frame stays behind a lazy boundary (window-panels bundle law).
const AnswerQuestionWindow = dynamic(
  () =>
    import("./AnswerQuestionWindow").then((m) => ({
      default: m.AnswerQuestionWindow,
    })),
  { ssr: false },
);

function isLive(q: InterviewQuestionRow): boolean {
  return q.state !== "answered" && q.state !== "deferred";
}

// ── Holes ───────────────────────────────────────────────────────────────────

const CLASSIFICATION_CHIP: Record<HoleClassification, string> = {
  fatal: "border-destructive/50 bg-destructive/10 text-destructive",
  unknown: "border-primary/40 bg-primary/10 text-primary",
  undecided: "border-border bg-muted text-muted-foreground",
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
      holeMerged({ ...hole, ...optimistic, updated_at: new Date().toISOString() }),
    );
    try {
      dispatch(holeMerged(await run()));
    } catch (err) {
      dispatch(holeForced(prev));
      toast.error(
        err instanceof Error ? err.message : "Could not update the hole.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card shadow-sm",
        needsArbitration
          ? "border-destructive/40"
          : "border-border hover:border-primary/40",
        settled && "opacity-70",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          hole.classification === "fatal"
            ? "bg-destructive"
            : hole.classification === "unknown"
              ? "bg-primary"
              : "bg-border",
        )}
        aria-hidden
      />
      <div className="space-y-2 py-2.5 pl-3.5 pr-2.5">
        {needsArbitration && (
          <p className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Needs your call — the room deadlocked
          </p>
        )}
        <p className="text-[13.5px] font-medium leading-snug text-foreground">
          {hole.claim_attacked}
        </p>
        {hole.why_it_breaks && (
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {hole.why_it_breaks}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide",
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
              {(
                Object.keys(HOLE_CLASSIFICATION_LABELS) as HoleClassification[]
              ).map((c) => (
                <DropdownMenuItem
                  key={c}
                  disabled={c === hole.classification}
                  onSelect={() =>
                    void applyPatch(
                      { classification: c, reclassified_by_human: true },
                      () => reclassifyHole(hole.id, c),
                    )
                  }
                >
                  {HOLE_CLASSIFICATION_LABELS[c]}
                </DropdownMenuItem>
              ))}
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
          {!settled && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-11 px-2 text-xs text-muted-foreground sm:h-7"
              disabled={busy}
              onClick={() => setConfirmRisk(true)}
            >
              Accept as risk
            </Button>
          )}
        </div>
        {hole.resolution && (
          <p className="text-[11px] text-muted-foreground">{hole.resolution}</p>
        )}
      </div>
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
    </article>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

function Count({ value, tone }: { value: number; tone: "open" | "pending" }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px] font-semibold",
        tone === "pending"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {value} {tone === "pending" ? "ready to send" : "open"}
    </span>
  );
}

export function QuestionsPanel() {
  const dispatch = useAppDispatch();
  const questions = useAppSelector(selectQuestionsGroupedForStage);
  const holes = useAppSelector(selectHolesOrdered);
  const openHoles = useAppSelector(selectOpenHoleCount);
  const pendingAnswers = useAppSelector(selectPendingAnswers);
  const session = useAppSelector(selectRoomSession);
  const sessionId = useAppSelector(selectRoomSessionId);
  const hydrated = useAppSelector(selectRoomHydrated);
  const currentRound = session?.current_round ?? 0;

  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<readonly string[]>([]);

  const pendingByQuestion: Record<string, string> = {};
  for (const a of pendingAnswers) pendingByQuestion[a.questionId] = a.answerText;

  const live = questions.filter(isLive);
  const settled = questions.filter((q) => !isLive(q));
  const pendingCount = live.filter(
    (q) => pendingByQuestion[q.id] !== undefined,
  ).length;
  const openCount = live.length - pendingCount;

  const setState = async (
    question: InterviewQuestionRow,
    state: QuestionState,
  ) => {
    if (busyIds.includes(question.id)) return;
    setBusyIds((ids) => [...ids, question.id]);
    dispatch(
      questionMerged({
        ...question,
        state,
        updated_at: new Date().toISOString(),
      }),
    );
    try {
      dispatch(questionMerged(await updateQuestionState(question.id, state)));
    } catch (err) {
      dispatch(questionForced(question));
      toast.error(
        err instanceof Error ? err.message : "Could not update the question.",
      );
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== question.id));
    }
  };

  const cardProps = (q: InterviewQuestionRow) => ({
    question: q,
    currentRound,
    pendingAnswer: pendingByQuestion[q.id] ?? null,
    busy: busyIds.includes(q.id),
    onAnswer: (target: InterviewQuestionRow) => setOpenQuestionId(target.id),
    onDiscardAnswer: (target: InterviewQuestionRow) =>
      dispatch(answerDiscarded({ questionId: target.id })),
    onDismiss: (target: InterviewQuestionRow) => void setState(target, "deferred"),
    onReopen: (target: InterviewQuestionRow) => void setState(target, "open"),
  });

  const openQuestion =
    openQuestionId === null
      ? null
      : (questions.find((q) => q.id === openQuestionId) ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <ListTodo className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Questions for you
        </h2>
        <span className="ml-auto flex items-center gap-1">
          <Count value={openCount} tone="open" />
          {pendingCount > 0 && <Count value={pendingCount} tone="pending" />}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {!hydrated ? (
          <>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </>
        ) : questions.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No questions yet — the room files them here as it works, and you
            answer them whenever you like.
          </p>
        ) : (
          <>
            {live.map((q) => (
              <QuestionCard key={q.id} {...cardProps(q)} />
            ))}

            {settled.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="settled" className="border-none">
                  <AccordionTrigger className="rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                    Answered &amp; dismissed ({settled.length})
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-1 pt-1">
                    {settled.map((q) => (
                      <QuestionCard key={q.id} {...cardProps(q)} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </>
        )}

        {hydrated && holes.length > 0 && (
          <section className="space-y-2 pt-2">
            <div className="flex items-center gap-1.5 border-t border-border px-1 pt-3">
              <AlertTriangle
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Holes
              </h3>
              <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                {openHoles} open
              </span>
            </div>
            {holes.map((h) => (
              <HoleCard key={h.id} hole={h} />
            ))}
          </section>
        )}
      </div>

      {openQuestion && (
        <AnswerQuestionWindow
          key={openQuestion.id}
          question={openQuestion}
          pendingAnswer={pendingByQuestion[openQuestion.id] ?? null}
          sessionId={sessionId}
          onClose={() => setOpenQuestionId(null)}
          onDismiss={(target) => void setState(target, "deferred")}
        />
      )}
    </div>
  );
}
