"use client";

// features/question-desk/components/ReviewTable.tsx
//
// "Decided in your name" — the dense table.
//
// One line per decision the desk made instead of asking: what was asked, what
// now happens, and two buttons. Confirm leaves it standing; Overturn hands it
// back as a real question and REQUIRES his words — an overturn with no reason
// is a decision nobody can act on, and the DB refuses it too
// (`decision_question_answer_words_ck`).
//
// Grouped by `review_kind` with the reference page's labels. `review_kind` is
// free text in the contract, so an unknown kind renders under its own raw value
// in a trailing group rather than being silently dropped — a row that never
// reaches him is exactly the failure this whole surface exists to end.

import { useMemo, useState } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { cn } from "@/lib/utils";
import { questionRecordingOrigin } from "../hooks/useDictationAudio";
import {
  REVIEW_KIND_LABEL,
  REVIEW_KIND_ORDER,
  type DecisionQuestionRow,
} from "../types";

export interface ReviewTableProps {
  interviewId: string;
  questions: DecisionQuestionRow[];
  onConfirm: (question: DecisionQuestionRow) => void;
  onOverturn: (
    question: DecisionQuestionRow,
    words: string,
    spoken: boolean,
  ) => void;
  /** Per-row line under the buttons: what just happened, or why it did not. */
  lines: Record<string, { tone: "ok" | "warn"; text: string } | undefined>;
  busyId: string | null;
}

export function ReviewTable({
  interviewId,
  questions,
  onConfirm,
  onOverturn,
  lines,
  busyId,
}: ReviewTableProps) {
  const [openWhy, setOpenWhy] = useState<Record<string, boolean>>({});
  const [overturning, setOverturning] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byKind = new Map<string, DecisionQuestionRow[]>();
    for (const question of questions) {
      const kind = question.review_kind ?? "unsorted";
      const list = byKind.get(kind);
      if (list) list.push(question);
      else byKind.set(kind, [question]);
    }
    const known = REVIEW_KIND_ORDER.filter((kind) => byKind.has(kind));
    const rest = [...byKind.keys()]
      .filter((kind) => !REVIEW_KIND_ORDER.includes(kind as never))
      .sort();
    return [...known, ...rest].map((kind) => ({
      kind,
      label: REVIEW_KIND_LABEL[kind] ?? kind,
      rows: byKind.get(kind) ?? [],
    }));
  }, [questions]);

  const reviewed = questions.filter((q) => q.verdict !== null).length;
  const overturned = questions.filter((q) => q.verdict === "overturn").length;

  return (
    <div className="max-w-[1180px]">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
          {reviewed} of {questions.length} reviewed · {overturned} overturned
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.kind} className="mb-7">
          <h3 className="mb-2 flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted-foreground">
            <b className="font-medium text-foreground">{group.label}</b> ·{" "}
            {group.rows.length}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse bg-card text-[13px]">
              <thead>
                <tr>
                  <Th className="w-[38%]">What was asked</Th>
                  <Th className="w-[42%]">What now happens</Th>
                  <Th className="w-[20%]">
                    <span className="sr-only">Confirm or overturn</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => {
                  const line = lines[row.id];
                  const confirmed = row.verdict === "confirm";
                  const isOverturned = row.verdict === "overturn";
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border last:border-b-0",
                        confirmed && "bg-success/10",
                        isOverturned && "bg-destructive/10",
                      )}
                    >
                      <td className="qd-editorial px-2.5 py-2.5 align-top text-[14.5px] leading-snug">
                        {row.question}
                        {row.decision_why ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenWhy((current) => ({
                                  ...current,
                                  [row.id]: !current[row.id],
                                }))
                              }
                              className="mt-1 block rounded font-mono text-[10.5px] text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              {openWhy[row.id] ? "hide why" : "why"}
                            </button>
                            {openWhy[row.id] ? (
                              <div className="mt-1.5 max-w-[70ch] font-sans text-[12.5px] whitespace-pre-wrap text-foreground/80">
                                {row.decision_why}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-2.5 align-top leading-snug text-foreground/80">
                        <span className="whitespace-pre-wrap">
                          {row.decision ?? "—"}
                        </span>
                        {row.work ? (
                          <div className="mt-1 text-[12px] text-warning">
                            Work still open: {row.work}
                          </div>
                        ) : null}
                        {isOverturned && row.answer_text ? (
                          <div className="mt-1.5 text-[12.5px] whitespace-pre-wrap text-destructive">
                            Your words: {row.answer_text}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          <Mini
                            onClick={() => onConfirm(row)}
                            busy={busyId === row.id}
                          >
                            Confirm
                          </Mini>
                          <Mini
                            tone="warn"
                            onClick={() => {
                              setOverturning(row.id);
                              setWords(row.answer_text ?? "");
                              setSpoken(false);
                              setWordsError(null);
                            }}
                            busy={busyId === row.id}
                          >
                            Overturn
                          </Mini>
                        </div>
                        {overturning === row.id ? (
                          <div className="mt-2">
                            {/* The platform field: the same mic, live
                                transcription, cleanup and right-click menu as
                                every other text box on this surface. */}
                            <RecordingOriginProvider
                              origin={questionRecordingOrigin(
                                interviewId,
                                row.id,
                                row.title,
                              )}
                            >
                              <ProTextarea
                                autoFocus
                                value={words}
                                onChange={(event) =>
                                  setWords(event.target.value)
                                }
                                onTranscriptionComplete={() => setSpoken(true)}
                                placeholder="What should happen instead? Typed or spoken, recorded exactly as you give it."
                                autoGrow
                                minHeight={70}
                                maxHeight={220}
                                wrapperClassName="w-[320px] max-w-[70vw]"
                              />
                            </RecordingOriginProvider>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Mini
                                tone="warn"
                                busy={busyId === row.id}
                                onClick={() => {
                                  if (words.length === 0) {
                                    setWordsError(
                                      "Write what should happen instead, or press Confirm.",
                                    );
                                    return;
                                  }
                                  setWordsError(null);
                                  setOverturning(null);
                                  onOverturn(row, words, spoken);
                                  setSpoken(false);
                                }}
                              >
                                Send it back
                              </Mini>
                              <Mini
                                busy={false}
                                onClick={() => {
                                  setOverturning(null);
                                  setSpoken(false);
                                  setWordsError(null);
                                }}
                              >
                                Cancel
                              </Mini>
                            </div>
                            {wordsError ? (
                              <p className="mt-1 font-mono text-[10.5px] text-warning">
                                {wordsError}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {line ? (
                          <p
                            className={cn(
                              "mt-1 font-mono text-[10.5px]",
                              line.tone === "ok"
                                ? "text-success"
                                : "text-warning",
                            )}
                          >
                            {line.text}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-border bg-muted px-2.5 py-2 text-left font-mono text-[10px] font-medium tracking-[0.1em] uppercase text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Mini({
  children,
  onClick,
  tone,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "warn";
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      className={cn(
        "rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        tone === "warn"
          ? "hover:border-destructive hover:text-destructive"
          : "hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
