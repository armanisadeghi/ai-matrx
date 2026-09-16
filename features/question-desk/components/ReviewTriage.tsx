"use client";

// features/question-desk/components/ReviewTriage.tsx
//
// "Decided in your name" — triage, not a table.
//
// Arman, 2026-09-13: "When you present me with 117 things at once, that's the
// surefire way of making sure I get nothing done, especially when the UI makes
// it impossible for me to just click through with ease. Also, most are too
// verbose and the only way to read them is the long way. It would be nice to
// have a short and easy one with more detail."
//
// Champions (law 9): Superhuman's triage — one item, one keystroke, next —
// and Linear's inbox. Matched: a batch of ten, one line each, Y/N/J/K/Enter,
// the row advances on answer, every answer saved the instant it is given with
// an Undo. Beaten: the batch counter is honest data ("10 of 117 · 3 batches
// done"), the reason and the full decision are one keystroke away and never
// inline, and the row keeps showing what the system DID with the answer
// ("confirmed — stands", "coming back as a question") as the server moves it —
// live, through the same realtime channel that feeds the whole interview.
//
// THE KEYBOARD CONTRACT (only while this screen is the view)
//   Y      fine — confirm            N      overturn (opens the words box)
//   J / K  next / previous row        Enter  expand / collapse the detail
//   Esc    close the detail / cancel the overturn (words kept on screen)
//   ⌘Z     undo the last answer (the interview's own Undo, same window)
//   T      one-question view (the interview's key, untouched)
// Inside the overturn box only Esc and ⌘/Ctrl+Enter are ours.
//
// DASHBOARDS ARE DATA (Arman, 2026-09-12). Nothing on this screen explains
// itself in a paragraph: counts, a bar, one line per decision, a key legend.
//
// NEVER 117 AT ONCE. The open rows are served highest weight first in batches
// of `question_desk.review_batch_size` (a knob, default 10). A batch stays on
// screen until every row in it is answered; the between-batch card offers the
// next ten or a stop. Answered rows stay visible in their batch, marked, so
// the person sees what moved — they never pile up below.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ProTextarea } from "@/components/official/ProTextarea";
import { NO_WORDS_OVERTURN_MESSAGE, hasWords } from "../answerWords";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { cn } from "@/lib/utils";
import { questionRecordingOrigin } from "../hooks/useDictationAudio";
import {
  REVIEW_KIND_LABEL,
  type DecisionQuestionRow,
  isAnswered,
} from "../types";

const WEIGHT_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export interface ReviewTriageProps {
  interviewId: string;
  questions: DecisionQuestionRow[];
  batchSize: number;
  onConfirm: (question: DecisionQuestionRow) => void;
  onOverturn: (
    question: DecisionQuestionRow,
    words: string,
    spoken: boolean,
  ) => void;
  /** Per-row line: what just happened, or why it did not. */
  lines: Record<string, { tone: "ok" | "warn"; text: string } | undefined>;
  busyId: string | null;
  /** The interview's Undo — shown on the just-answered row while it lasts. */
  undoRowId: string | null;
  onUndo: () => void;
  /** Where "stop for now" goes. */
  stopHref: string;
}

/** Highest weight first, then the desk's own order. */
export function orderForTriage(rows: DecisionQuestionRow[]): DecisionQuestionRow[] {
  return [...rows].sort((a, b) => {
    const wa = WEIGHT_RANK[a.weight ?? ""] ?? 3;
    const wb = WEIGHT_RANK[b.weight ?? ""] ?? 3;
    if (wa !== wb) return wa - wb;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}

export function ReviewTriage({
  interviewId,
  questions,
  batchSize,
  onConfirm,
  onOverturn,
  lines,
  busyId,
  undoRowId,
  onUndo,
  stopHref,
}: ReviewTriageProps) {
  const size = Math.max(1, batchSize);
  const total = questions.length;
  const answeredCount = questions.filter(isAnswered).length;
  const confirmedCount = questions.filter((q) => q.verdict === "confirm").length;
  const overturnedCount = questions.filter((q) => q.verdict === "overturn").length;

  // THE BATCH IS PINNED BY ID. Sorting the open rows on every render would
  // make an answered row fall out of the batch and the next one slide in —
  // the list would shift under the person's eyes on every keystroke. Instead
  // the ids of the current batch are fixed when the batch opens; rows keep
  // their place until the person asks for the next ten.
  const [batchIds, setBatchIds] = useState<string[]>(() =>
    orderForTriage(questions.filter((q) => !isAnswered(q)))
      .slice(0, size)
      .map((q) => q.id),
  );
  const [focusId, setFocusId] = useState<string | null>(() => batchIds[0] ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [overturning, setOverturning] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const openNextBatch = useCallback(() => {
    const open = orderForTriage(questions.filter((q) => !isAnswered(q)));
    const ids = open.slice(0, size).map((q) => q.id);
    setBatchIds(ids);
    setFocusId(ids[0] ?? null);
    setOpenId(null);
    setOverturning(null);
  }, [questions, size]);

  const batch = useMemo(
    () =>
      batchIds
        .map((id) => byId.get(id))
        .filter((q): q is DecisionQuestionRow => q !== undefined),
    [batchIds, byId],
  );
  // An empty batch means nothing was open when it was pinned — the card below
  // says "all reviewed" rather than showing a blank list.
  const batchAllAnswered = batch.every(isAnswered);
  const remainingOpen = total - answeredCount;
  // 🚨 "k BATCHES DONE" IS DERIVED FROM THE ROWS, NEVER LATCHED IN STATE
  // (V2 finding 5, 2026-09-14). It was component state that nothing ever
  // incremented, so a person working 117 decisions across sittings always read
  // "0 batches done" beside honest numbers — a figure on a dashboard that was
  // not true. A batch is done when a batch's worth of decisions has been
  // answered, so the count is the answered rows divided by the batch size: it
  // survives a reload, a new tab and a new day without storing anything,
  // because the rows already know.
  const batchesDone = Math.floor(answeredCount / size);
  const batchCount = Math.max(1, Math.ceil(total / size));
  const batchNumber = Math.min(batchCount, batchesDone + 1);
  // THE CARD NAMES THE BATCH THAT JUST FINISHED, NOT THE NEXT ONE (V3
  // observation N1, 2026-09-16: on finishing batch 1 the card read "batch 2
  // done" beside a counter that correctly read "batch 2 of 3 · 1 batch done").
  // The finished batch is the one the answered rows just filled — the ceiling
  // of answered / size — which is also right for a short last batch (26 rows
  // in tens: answering all 26 finishes batch 3, not batch 2).
  const finishedBatchNumber = Math.min(batchCount, Math.max(1, Math.ceil(answeredCount / size)));

  // THE ROW ADVANCES ON ANSWER — derived, never latched. The chosen row is
  // state; the EFFECTIVE focus is the chosen row while it is open, else the
  // next open row after it in the batch, else the last open one before it.
  // Deriving it means the moment the saved row comes back answered, focus is
  // already on the next question with no render in between.
  const effectiveFocusId = useMemo(() => {
    if (!focusId) return batch.find((q) => !isAnswered(q))?.id ?? null;
    const index = batch.findIndex((q) => q.id === focusId);
    const chosen = index >= 0 ? batch[index] : undefined;
    if (!chosen || !isAnswered(chosen)) return focusId;
    const after = batch.slice(index + 1).find((q) => !isAnswered(q));
    const before = [...batch.slice(0, index)].reverse().find((q) => !isAnswered(q));
    return (after ?? before ?? chosen).id;
  }, [batch, focusId]);
  const focusIndex = batch.findIndex((q) => q.id === effectiveFocusId);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (batch.length === 0) return;
      const index = focusIndex < 0 ? 0 : focusIndex;
      const next = batch[Math.min(batch.length - 1, Math.max(0, index + delta))];
      if (next) setFocusId(next.id);
    },
    [batch, focusIndex],
  );

  const startOverturn = useCallback((row: DecisionQuestionRow) => {
    setOverturning(row.id);
    setWords(row.answer_text ?? "");
    setSpoken(false);
    setWordsError(null);
    setFocusId(row.id);
  }, []);

  const sendBack = useCallback(() => {
    const row = overturning ? byId.get(overturning) : undefined;
    if (!row) return;
    // ONE PREDICATE (../answerWords). Three spaces overturned a real decision
    // on production and the server refiled a question whose premise was blank
    // (V2 finding 2, 2026-09-14).
    if (!hasWords(words)) {
      setWordsError(NO_WORDS_OVERTURN_MESSAGE);
      return;
    }
    setWordsError(null);
    setOverturning(null);
    onOverturn(row, words, spoken);
    setSpoken(false);
  }, [overturning, byId, words, spoken, onOverturn]);

  // ---- keys -------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (overturning) {
          event.preventDefault();
          setOverturning(null); // words stay in state; N reopens with them
          return;
        }
        if (openId) {
          event.preventDefault();
          setOpenId(null);
        }
        return;
      }
      if (typing || overturning) {
        if (meta && event.key === "Enter") {
          event.preventDefault();
          sendBack();
        }
        return;
      }
      if (meta) return; // ⌘Z and friends belong to the interview

      const focused = effectiveFocusId ? byId.get(effectiveFocusId) : undefined;
      switch (event.key.toLowerCase()) {
        case "y":
          if (focused && !isAnswered(focused) && busyId === null) {
            event.preventDefault();
            onConfirm(focused);
          }
          return;
        case "n":
          if (focused && busyId === null) {
            event.preventDefault();
            startOverturn(focused);
          }
          return;
        case "j":
          event.preventDefault();
          move(1);
          return;
        case "k":
          event.preventDefault();
          move(-1);
          return;
        case "enter":
          event.preventDefault();
          if (batchAllAnswered && remainingOpen > 0) {
            openNextBatch();
            return;
          }
          if (focused) setOpenId((o) => (o === focused.id ? null : focused.id));
          return;
        default:
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    batchAllAnswered,
    remainingOpen,
    busyId,
    byId,
    effectiveFocusId,
    move,
    onConfirm,
    openId,
    openNextBatch,
    overturning,
    sendBack,
    startOverturn,
  ]);

  // Keep the focused row in view as J/K move it.
  useEffect(() => {
    if (!effectiveFocusId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-row="${effectiveFocusId}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [effectiveFocusId]);

  if (total === 0) return null;

  return (
    <div className="max-w-[1080px]">
      {/* ---- the numbers ------------------------------------------------ */}
      <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-border bg-background/95 px-1 pt-1 pb-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Progress
            value={answeredCount}
            max={total}
            tone="success"
            className="h-1.5 w-[220px]"
            aria-label="Decisions reviewed"
          />
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
            <b className="font-medium text-foreground">
              {batch.length} of {total}
            </b>{" "}
            · batch {batchNumber} of {batchCount} · {batchesDone}{" "}
            {batchesDone === 1 ? "batch" : "batches"} done · {confirmedCount}{" "}
            confirmed · {overturnedCount} overturned · {remainingOpen} left
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={stopHref}
              className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Stop for now
            </Link>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-muted-foreground">
          <Key k="Y">fine</Key>
          <Key k="N">overturn</Key>
          <Key k="J / K">next / previous</Key>
          <Key k="Enter">detail</Key>
          <Key k="Esc">close</Key>
          <Key k="⌘Z">undo</Key>
        </div>
      </div>

      {/* ---- the batch --------------------------------------------------- */}
      <div ref={listRef} className="overflow-hidden rounded-lg border border-border bg-card">
        {batch.map((row) => {
          const focused = row.id === effectiveFocusId;
          const open = row.id === openId;
          const answered = isAnswered(row);
          const line = lines[row.id];
          const confirmed = row.verdict === "confirm";
          const overturned = row.verdict === "overturn";
          const busy = busyId === row.id;
          return (
            <div
              key={row.id}
              data-row={row.id}
              className={cn(
                "border-b border-border last:border-b-0",
                focused && "bg-primary/5",
                confirmed && "bg-success/10",
                overturned && "bg-destructive/10",
              )}
            >
              <div
                role="button"
                tabIndex={-1}
                onClick={() => {
                  setFocusId(row.id);
                  setOpenId((o) => (o === row.id ? null : row.id));
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-[13.5px] leading-snug",
                  focused && "shadow-[inset_2px_0_0_hsl(var(--primary))]",
                )}
              >
                <WeightDot weight={row.weight} />
                <span className="qd-editorial min-w-0 flex-1 text-[14.5px] text-foreground">
                  {row.decision ?? row.title}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {answered ? (
                    <>
                      <Badge variant={overturned ? "destructive" : "success"}>
                        {overturned ? "Overturned" : "Confirmed"}
                      </Badge>
                      {row.status_note ? (
                        <span
                          className="font-mono text-[10.5px] text-muted-foreground"
                          aria-live="polite"
                        >
                          {row.status_note}
                        </span>
                      ) : null}
                      {undoRowId === row.id ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            onUndo();
                          }}
                        >
                          Undo
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="xs"
                        aria-busy={busy}
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          setFocusId(row.id);
                          onConfirm(row);
                        }}
                      >
                        <kbd className="mr-1 font-mono text-[10px] opacity-65">Y</kbd>
                        Fine
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        aria-busy={busy}
                        disabled={busy}
                        className="hover:border-destructive hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          startOverturn(row);
                        }}
                      >
                        <kbd className="mr-1 font-mono text-[10px] opacity-65">N</kbd>
                        Overturn
                      </Button>
                    </>
                  )}
                </span>
              </div>

              {line ? (
                <p
                  role={line.tone === "warn" ? "alert" : undefined}
                  className={cn(
                    "px-3 pb-2 font-mono text-[10.5px]",
                    line.tone === "ok" ? "text-success" : "text-warning",
                  )}
                >
                  {line.text}
                </p>
              ) : null}

              {open ? (
                <dl className="grid gap-x-4 gap-y-2 border-t border-border bg-muted/30 px-3 py-3 text-[13px] sm:grid-cols-[max-content_1fr]">
                  <Dt>Asked</Dt>
                  <dd className="qd-editorial text-[14px] text-foreground">{row.question}</dd>
                  {row.decision_why ? (
                    <>
                      <Dt>In full</Dt>
                      <dd className="whitespace-pre-wrap text-foreground/85">
                        {row.decision_why}
                      </dd>
                    </>
                  ) : null}
                  {row.work ? (
                    <>
                      <Dt>Work open</Dt>
                      <dd className="text-warning">{row.work}</dd>
                    </>
                  ) : null}
                  <Dt>Kind</Dt>
                  <dd className="text-muted-foreground">
                    {REVIEW_KIND_LABEL[row.review_kind ?? ""] ?? row.review_kind ?? "—"}
                    {row.node ? ` · ${row.node}` : ""}
                    {row.weight ? ` · ${row.weight}` : ""}
                  </dd>
                  {overturned && row.answer_text ? (
                    <>
                      <Dt>Your words</Dt>
                      <dd className="whitespace-pre-wrap text-destructive">
                        {row.answer_text}
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : null}

              {overturning === row.id ? (
                <div className="border-t border-border px-3 py-2.5">
                  <RecordingOriginProvider
                    origin={questionRecordingOrigin(interviewId, row.id, row.title)}
                  >
                    <ProTextarea
                      autoFocus
                      value={words}
                      onChange={(event) => setWords(event.target.value)}
                      onTranscriptionComplete={() => setSpoken(true)}
                      // The denied-microphone sentence reaches the slot this
                      // box already shows refusals in (V2 finding 3).
                      onTranscriptionError={(message) => setWordsError(message)}
                      placeholder="What should happen instead? Typed or spoken, recorded exactly as you give it."
                      autoGrow
                      minHeight={64}
                      maxHeight={220}
                      wrapperClassName="max-w-[70ch]"
                    />
                  </RecordingOriginProvider>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Button variant="destructive" size="xs" disabled={busy} onClick={sendBack}>
                      Send it back
                      <kbd className="ml-1.5 font-mono text-[10px] opacity-65">⌘↵</kbd>
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setOverturning(null)}>
                      Cancel
                      <kbd className="ml-1.5 font-mono text-[10px] opacity-65">Esc</kbd>
                    </Button>
                    {wordsError ? (
                      <span role="alert" className="font-mono text-[10.5px] text-warning">
                        {wordsError}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ---- between batches --------------------------------------------- */}
      {batchAllAnswered ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
          <span className="font-mono text-[11px] text-muted-foreground">
            batch {finishedBatchNumber} done · {remainingOpen} left
          </span>
          {remainingOpen > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                openNextBatch();
              }}
            >
              Next {Math.min(size, remainingOpen)}
              <kbd className="ml-1.5 font-mono text-[10px] opacity-65">Enter</kbd>
            </Button>
          ) : (
            <span className="font-mono text-[11px] text-success">all reviewed</span>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href={stopHref}>Stop for now</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Key({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span>
      <kbd className="rounded border border-border bg-muted px-1 text-foreground/80">{k}</kbd>{" "}
      {children}
    </span>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
      {children}
    </dt>
  );
}

function WeightDot({ weight }: { weight: string | null }) {
  const label = weight ? `${weight} weight` : "no weight";
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "mt-[7px] size-[7px] shrink-0 rounded-full",
        weight === "high" && "bg-destructive",
        weight === "medium" && "bg-warning",
        weight === "low" && "bg-muted-foreground/50",
        !weight && "bg-border",
      )}
    />
  );
}
