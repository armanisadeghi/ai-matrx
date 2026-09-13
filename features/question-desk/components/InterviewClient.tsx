"use client";

// features/question-desk/components/InterviewClient.tsx
//
// THE INTERVIEW. One question filling the screen, answered with one key.
//
// Champions (named before building, per law 9):
//   Typeform  — one-at-a-time flow, a progress meter, answer-by-keystroke.
//               Matched. Beaten by five collapsed research parts, read-aloud
//               and a voice answer stored verbatim with its recording.
//   Linear    — the dense table: group headers, one-line rows, inline actions.
//               Matched. Beaten by confirm/overturn with a verbatim override
//               that turns a row back into a real question.
//   Apple     — every action has a key, the key is printed ON the button,
//               focus is never trapped. Matched. Beaten by R/V/Esc: audio in
//               and audio out on the same keyboard plane as the answers.
//
// THE KEYBOARD CONTRACT
//   1 / 2 / 3   take the recommendation / skip / not mine
//   W           write an answer      ⌘↵ (Ctrl+↵) saves it
//   V           answer by voice      ↵ saves the transcript, Esc discards it
//   J / K       next / previous      R read aloud     T table view
//   Esc         stop audio, cancel voice, close the write box
//   ⌘Z / Ctrl+Z undo the answer just saved (30 seconds)
// While a textarea or input has focus, ONLY Esc and ⌘/Ctrl+Enter are ours —
// every other key belongs to what he is typing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { loadInterview, markInterviewOpened } from "../data/interviews";
import { reopenAnswer, saveAnswer, type SaveOutcome } from "../data/questions";
import { useAnswerDraft } from "../hooks/useAnswerDraft";
import { useInterviewQuestions } from "../hooks/useInterviewQuestions";
import { useQuestionDeskKnobs } from "../hooks/useQuestionDeskKnobs";
import { useReadAloud } from "../hooks/useReadAloud";
import { useVoiceAnswer } from "../hooks/useVoiceAnswer";
import {
  isAnswered,
  type DecisionInterviewRow,
  type DecisionQuestionRow,
  type Verdict,
} from "../types";
import { AnswerBar, type SaveLine } from "./AnswerBar";
import { AskTable } from "./AskTable";
import { QuestionDeskRail } from "./QuestionDeskRail";
import { QuestionScreen } from "./QuestionScreen";
import { ReviewTable } from "./ReviewTable";

/** How long the just-saved line keeps its Undo. */
const UNDO_WINDOW_MS = 30_000;

export interface InterviewClientProps {
  interviewId: string;
  /** `?q=<slug>` from the notification deep link — opens that question. */
  initialSlug?: string;
}

export function InterviewClient({
  interviewId,
  initialSlug,
}: InterviewClientProps) {
  const userId = useAppSelector(selectUserId);
  const knobs = useQuestionDeskKnobs();
  const {
    questions,
    loading,
    error,
    truncated,
    applyRow,
    reload,
  } = useInterviewQuestions(interviewId);

  const [interview, setInterview] = useState<DecisionInterviewRow | null>(null);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [view, setView] = useState<"one" | "table" | null>(null);
  const [writing, setWriting] = useState(false);
  const [saveLine, setSaveLine] = useState<SaveLine | null>(null);
  const [rowLines, setRowLines] = useState<
    Record<string, { tone: "ok" | "warn"; text: string } | undefined>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undoRow, setUndoRow] = useState<DecisionQuestionRow | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- the interview row -------------------------------------------------
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const row = await loadInterview(interviewId);
        if (!live) return;
        setInterview(row);
        setInterviewError(row ? null : "This interview does not exist, or it is not yours to read.");
        if (row) void markInterviewOpened(row);
      } catch (loadError) {
        if (!live) return;
        setInterviewError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [interviewId]);

  // ---- which questions, which view --------------------------------------
  const askQuestions = useMemo(
    () => questions.filter((q) => q.mode === "ask"),
    [questions],
  );
  const reviewQuestions = useMemo(
    () => questions.filter((q) => q.mode === "review"),
    [questions],
  );
  /** The one-per-screen queue. Review rows never enter it — they are a table. */
  const queue = askQuestions;

  // WHICH VIEW IS DERIVED, NEVER LATCHED ON FIRST RENDER. An earlier version
  // set it in an effect the moment the knobs resolved — which is BEFORE the
  // questions have loaded — so a review-only interview latched "one", found no
  // ask-mode question, and printed "Nothing to ask here yet." over 117 real
  // decisions. Found in the browser, on the real 117-row interview.
  // `view` now holds only what the PERSON chose; everything else is computed.
  const resolvedView: "one" | "table" | null =
    knobs.state !== "ready" || loading
      ? null
      : (view ??
        (askQuestions.length === 0 && reviewQuestions.length > 0
          ? "table"
          : knobs.defaultView));

  // The deep link's question wins; otherwise start on the first open one.
  useEffect(() => {
    if (currentId !== null || queue.length === 0) return;
    const bySlug = initialSlug
      ? queue.find((q) => q.slug === initialSlug)
      : undefined;
    const firstOpen = queue.find((q) => !isAnswered(q));
    setCurrentId((bySlug ?? firstOpen ?? queue[0]).id);
  }, [currentId, queue, initialSlug]);

  const current = useMemo(
    () => queue.find((q) => q.id === currentId) ?? null,
    [queue, currentId],
  );

  const draft = useAnswerDraft(current?.id ?? null);
  const voice = useVoiceAnswer({
    questionId: current?.id ?? null,
    questionTitle: current?.title ?? "",
    interviewId,
  });
  const readAloudParts = knobs.state === "ready" ? knobs.readAloudParts : [];
  const readAloud = useReadAloud(readAloudParts);

  // ---- saving ------------------------------------------------------------
  const finishSave = useCallback(
    (outcome: SaveOutcome, question: DecisionQuestionRow, forRow: boolean) => {
      if (outcome.status === "saved") {
        applyRow(outcome.row);
        setUndoRow(outcome.row);
        const line: SaveLine = { tone: "ok", text: "Saved." };
        if (forRow) setRowLines((c) => ({ ...c, [question.id]: line }));
        else setSaveLine(line);
        return true;
      }
      if (outcome.status === "conflict") applyRow(outcome.currentRow);
      const line: SaveLine = { tone: "warn", text: outcome.message };
      if (forRow) setRowLines((c) => ({ ...c, [question.id]: line }));
      else setSaveLine(line);
      toast.error(outcome.message);
      return false;
    },
    [applyRow],
  );

  const advance = useCallback(() => {
    const index = queue.findIndex((q) => q.id === currentId);
    const after = queue.slice(index + 1).find((q) => !isAnswered(q));
    const anyOpen = queue.find((q) => !isAnswered(q) && q.id !== currentId);
    const next = after ?? anyOpen;
    if (next) setCurrentId(next.id);
  }, [queue, currentId]);

  const record = useCallback(
    async (
      question: DecisionQuestionRow,
      verdict: Verdict,
      answerText: string | null,
      source: "keystroke" | "typed" | "voice",
      options?: { fromTable?: boolean; audioFileId?: string | null },
    ) => {
      if (!userId) {
        const message = "You are signed out — sign in again before answering.";
        setSaveLine({ tone: "warn", text: message });
        toast.error(message);
        return;
      }
      setBusyId(question.id);
      try {
        const outcome = await saveAnswer({
          question,
          verdict,
          answerText,
          source,
          answeredBy: userId,
          audioFileId: options?.audioFileId ?? null,
        });
        const ok = finishSave(outcome, question, options?.fromTable === true);
        if (ok) {
          if (question.id === current?.id) {
            draft.clear();
            setWriting(false);
            voice.reset();
            advance();
          }
        }
      } finally {
        setBusyId(null);
      }
    },
    [userId, finishSave, current?.id, draft, voice, advance],
  );

  const undo = useCallback(async () => {
    const row = undoRow;
    if (!row) return;
    setBusyId(row.id);
    try {
      const outcome = await reopenAnswer(row);
      if (outcome.status === "saved") {
        applyRow(outcome.row);
        setUndoRow(null);
        setCurrentId(outcome.row.mode === "ask" ? outcome.row.id : currentId);
        setSaveLine({ tone: "ok", text: "Re-opened — answer it again." });
        setRowLines((c) => ({
          ...c,
          [row.id]: { tone: "ok", text: "Re-opened." },
        }));
      } else {
        if (outcome.status === "conflict") applyRow(outcome.currentRow);
        setSaveLine({ tone: "warn", text: outcome.message });
        toast.error(outcome.message);
      }
    } finally {
      setBusyId(null);
    }
  }, [undoRow, applyRow, currentId]);

  // The Undo expires with the sentence that offered it.
  useEffect(() => {
    if (!undoRow) return undefined;
    const timer = setTimeout(() => setUndoRow(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undoRow]);

  // ---- the write box -----------------------------------------------------
  const openWrite = useCallback(() => {
    setWriting(true);
  }, []);

  // Focus AFTER the box has actually mounted. A `requestAnimationFrame` from
  // inside the key handler fires before React has committed the textarea, so
  // the focus call hit nothing and every following keystroke was read as a
  // command — "three leading spaces" toggled the table view instead of being
  // typed. Found in the browser, on the real surface (2026-09-12).
  useEffect(() => {
    if (!writing) return;
    textareaRef.current?.focus();
  }, [writing]);

  const saveOwnWords = useCallback(() => {
    if (!current) return;
    if (draft.text.length === 0) {
      setSaveLine({
        tone: "warn",
        text: "Write something first, or use one of the buttons.",
      });
      return;
    }
    // VERBATIM. `draft.text` goes to the row exactly as typed.
    void record(current, "own_words", draft.text, "typed");
  }, [current, draft.text, record]);

  const saveVoice = useCallback(() => {
    if (!current || voice.transcript.length === 0) return;
    void record(current, "own_words", voice.transcript, "voice", {
      audioFileId: voice.audioFileId,
    });
  }, [current, voice.transcript, voice.audioFileId, record]);

  // ---- keys --------------------------------------------------------------
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
        if (voice.phase === "listening") {
          event.preventDefault();
          voice.reset();
          return;
        }
        if (voice.phase === "transcript") {
          event.preventDefault();
          setConfirmDiscard(true);
          return;
        }
        if (readAloud.speaking) {
          event.preventDefault();
          readAloud.stop();
          return;
        }
        if (writing) {
          event.preventDefault();
          setWriting(false);
          return;
        }
        return;
      }

      // A transcript being READ (not edited) is not a text box: Enter saves it
      // verbatim, which is the whole point of answering out loud.
      if (
        voice.phase === "transcript" &&
        !voice.editing &&
        !typing &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        saveVoice();
        return;
      }

      // While a box is OPEN, every printable key belongs to it — even in the
      // instant before focus lands, and even if a click moved focus to the
      // page. Only Esc (above) and ⌘/Ctrl+Enter are ours.
      const boxOpen = writing || voice.phase === "transcript";
      if (typing || boxOpen) {
        if (meta && event.key === "Enter") {
          event.preventDefault();
          if (voice.phase === "transcript") saveVoice();
          else saveOwnWords();
        }
        return;
      }

      if (meta && (event.key === "z" || event.key === "Z")) {
        if (!undoRow) return;
        event.preventDefault();
        void undo();
        return;
      }
      if (meta) return;

      switch (event.key.toLowerCase()) {
        case "1":
          if (current?.recommendation) {
            event.preventDefault();
            void record(current, "recommendation", null, "keystroke");
          }
          return;
        case "2":
          if (current) {
            event.preventDefault();
            void record(current, "skip", null, "keystroke");
          }
          return;
        case "3":
          if (current) {
            event.preventDefault();
            void record(current, "hand_back", null, "keystroke");
          }
          return;
        case "w":
          event.preventDefault();
          openWrite();
          return;
        case "v":
          if (voice.available && voice.phase === "idle") {
            event.preventDefault();
            voice.start();
          } else if (voice.phase === "listening") {
            event.preventDefault();
            voice.stop();
          }
          return;
        case "r":
          if (current && !readAloud.nothingToRead(current)) {
            event.preventDefault();
            if (readAloud.speaking) readAloud.stop();
            else readAloud.read(current);
          }
          return;
        case "t":
          event.preventDefault();
          setView((v) => ((v ?? resolvedView) === "table" ? "one" : "table"));
          return;
        case "j": {
          event.preventDefault();
          const index = queue.findIndex((q) => q.id === currentId);
          const next = queue[Math.min(index + 1, queue.length - 1)];
          if (next) setCurrentId(next.id);
          window.scrollTo(0, 0);
          return;
        }
        case "k": {
          event.preventDefault();
          const index = queue.findIndex((q) => q.id === currentId);
          const prev = queue[Math.max(index - 1, 0)];
          if (prev) setCurrentId(prev.id);
          window.scrollTo(0, 0);
          return;
        }
        default:
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    current,
    currentId,
    queue,
    record,
    openWrite,
    saveOwnWords,
    saveVoice,
    voice,
    readAloud,
    writing,
    undo,
    undoRow,
  ]);

  // ---- render ------------------------------------------------------------
  if (interviewError) {
    return <Notice tone="warn" title="This interview did not open" body={interviewError} />;
  }
  if (knobs.state === "failed") {
    return (
      <Notice
        tone="warn"
        title="The Question Desk's settings could not be read"
        body={`${knobs.reason} Until they resolve, this screen will not guess what the buttons should say — reload, or check the Question Desk settings in Administration.`}
      />
    );
  }
  if (error) {
    return (
      <Notice
        tone="warn"
        title="The questions did not load"
        body={error}
        action={{ label: "Try again", onClick: reload }}
      />
    );
  }
  if (!interview || loading || knobs.state !== "ready" || resolvedView === null) {
    return <Loading />;
  }

  const answeredCount = questions.filter(isAnswered).length;
  const allAnswered = queue.length > 0 && queue.every(isAnswered);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <QuestionDeskRail
        interview={interview}
        queue={queue}
        currentId={currentId}
        onGoTo={(id) => {
          setCurrentId(id);
          setView("one");
          window.scrollTo(0, 0);
        }}
        answeredCount={answeredCount}
        totalCount={questions.length}
        footer={
          <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
            {queue.length === 0 && reviewQuestions.length > 0 ? (
              // A rail that listed the review rows as a queue would offer a
              // door into the one-per-screen view that has nothing to show.
              // The honest thing is to say where they are.
              <p className="text-foreground/80">
                {reviewQuestions.length} decisions to review — they are in the
                table on the right.
              </p>
            ) : null}
            <p>Answers save straight to the record.</p>
            {truncated ? (
              <p className="text-warning">
                This interview holds more questions than one page can read. Some
                are not shown.
              </p>
            ) : null}
          </div>
        }
      />

      <main className="min-w-0 flex-1 px-5 pt-7 pb-56 lg:px-10 lg:pt-11">
        <Link
          href="/administration/question-desk"
          className="mb-5 inline-flex items-center gap-1.5 rounded font-mono text-[10.5px] tracking-wide text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-3" aria-hidden />
          All interviews
        </Link>

        {resolvedView === "table" ? (
          <div className="space-y-10">
            {reviewQuestions.length > 0 ? (
              <section>
                <h2 className="qd-editorial mb-1 text-[26px] font-semibold tracking-tight text-foreground">
                  Decided in your name
                </h2>
                <p className="mb-4 max-w-[78ch] text-[13.5px] text-foreground/80">
                  Each row is one decision in force. Confirm it, or overturn it
                  and it comes back to you as a real question.
                </p>
                <ReviewTable
                  questions={reviewQuestions}
                  lines={rowLines}
                  busyId={busyId}
                  onConfirm={(q) =>
                    void record(q, "confirm", null, "keystroke", {
                      fromTable: true,
                    })
                  }
                  onOverturn={(q, w) =>
                    void record(q, "overturn", w, "typed", { fromTable: true })
                  }
                />
              </section>
            ) : null}
            {askQuestions.length > 0 ? (
              <section>
                <h2 className="qd-editorial mb-3 text-[26px] font-semibold tracking-tight text-foreground">
                  Every question at once
                </h2>
                <AskTable
                  questions={askQuestions}
                  lines={rowLines}
                  busyId={busyId}
                  skipShipsRecommendation={knobs.skipShipsRecommendation}
                  onOpen={(q) => {
                    setCurrentId(q.id);
                    setView("one");
                    window.scrollTo(0, 0);
                  }}
                  onTakeRecommendation={(q) =>
                    void record(q, "recommendation", null, "keystroke", {
                      fromTable: true,
                    })
                  }
                  onSkip={(q) =>
                    void record(q, "skip", null, "keystroke", {
                      fromTable: true,
                    })
                  }
                  onHandBack={(q) =>
                    void record(q, "hand_back", null, "keystroke", {
                      fromTable: true,
                    })
                  }
                  onWrite={(q, w) =>
                    void record(q, "own_words", w, "typed", {
                      fromTable: true,
                    })
                  }
                />
              </section>
            ) : null}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("one")}
                className="rounded-md border border-border bg-card px-3.5 py-2 text-[13px] font-medium hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <kbd className="mr-2 rounded border border-current px-1 font-mono text-[10px] opacity-65">
                  T
                </kbd>
                One question at a time
              </button>
              {saveLine ? (
                <span
                  className={
                    saveLine.tone === "ok"
                      ? "font-mono text-[11px] text-success"
                      : "font-mono text-[11px] text-warning"
                  }
                >
                  {saveLine.text}
                </span>
              ) : null}
            </div>
          </div>
        ) : current ? (
          <>
            <QuestionScreen
              question={current}
              onReanswer={() => {
                draft.setText(current.answer_text ?? "");
                openWrite();
              }}
            />
            <AnswerBar
              hasRecommendation={!!current.recommendation}
              skipShipsRecommendation={knobs.skipShipsRecommendation}
              writing={writing}
              draftText={draft.text}
              onDraftChange={draft.setText}
              draftStorageError={draft.storageError}
              textareaRef={textareaRef}
              onOpenWrite={openWrite}
              onTakeRecommendation={() =>
                void record(current, "recommendation", null, "keystroke")
              }
              onSkip={() => void record(current, "skip", null, "keystroke")}
              onHandBack={() =>
                void record(current, "hand_back", null, "keystroke")
              }
              onSaveOwnWords={saveOwnWords}
              voice={voice}
              onStartVoice={voice.start}
              onStopVoice={voice.stop}
              onSaveVoice={saveVoice}
              onDiscardVoice={() => setConfirmDiscard(true)}
              speaking={readAloud.speaking}
              canReadAloud={!readAloud.nothingToRead(current)}
              onReadAloud={() => readAloud.read(current)}
              onStopReading={readAloud.stop}
              onToggleView={() => setView("table")}
              saveLine={saveLine}
              undoAvailable={undoRow !== null}
              onUndo={() => void undo()}
              busy={busyId !== null}
            />
            {voice.error ? (
              <p className="mt-3 max-w-[820px] text-[13px] text-destructive">
                {voice.error}
              </p>
            ) : null}
            {readAloud.error ? (
              <p className="mt-3 max-w-[820px] text-[13px] text-destructive">
                {readAloud.error}
              </p>
            ) : null}
          </>
        ) : allAnswered ? (
          <div className="py-16 text-center">
            <h2 className="qd-editorial text-[26px] font-semibold text-foreground">
              That is all of them.
            </h2>
            <p className="mx-auto mt-2 max-w-[46ch] text-[14.5px] text-muted-foreground">
              Every question in this interview has an answer on the record.
            </p>
          </div>
        ) : (
          <div className="py-16">
            <h2 className="qd-editorial text-[26px] font-semibold text-foreground">
              Nothing to ask here yet.
            </h2>
            <p className="mt-2 max-w-[52ch] text-[14.5px] text-muted-foreground">
              This interview holds no questions. The desk files them as it
              researches; they appear here the moment it does, without a reload.
            </p>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this recording?"
        description="What you said will be thrown away and cannot be recovered. The recording itself is kept until this answer is saved or discarded."
        confirmLabel="Discard it"
        cancelLabel="Keep it"
        variant="destructive"
        onConfirm={() => {
          voice.reset();
          setConfirmDiscard(false);
        }}
      />
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="animate-pulse border-b border-border bg-muted/40 px-4 py-4 lg:h-dvh lg:w-[260px] lg:border-r lg:border-b-0" />
      <div className="flex-1 space-y-4 px-5 pt-11 lg:px-10">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-24 w-full max-w-[62ch] animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function Notice({
  tone,
  title,
  body,
  action,
}: {
  tone: "warn";
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mx-auto max-w-[60ch] px-6 py-20">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-5">
        <AlertTriangle
          className={tone === "warn" ? "mt-0.5 size-5 text-warning" : ""}
          aria-hidden
        />
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1.5 text-[13.5px] text-foreground/80">{body}</p>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] font-medium hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
