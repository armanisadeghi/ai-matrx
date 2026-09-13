"use client";

// features/question-desk/components/AskTable.tsx
//
// The SAME questions as the one-per-screen flow, as a Linear-dense table: one
// line each, every action inline, nothing hidden behind a row click.
//
// This is what **T** shows for ask-mode questions, and what the
// `question_desk.default_view` knob selects when it resolves to "table" —
// someone who wants to see all eight at once and answer four of them without
// ever leaving the keyboard should not have to page through eight screens.

import { useState } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { cn } from "@/lib/utils";
import { questionRecordingOrigin } from "../hooks/useDictationAudio";
import {
  DOOR_LABEL,
  KIND_LABEL,
  VERDICT_LABEL,
  type DecisionQuestionRow,
  type Verdict,
} from "../types";

export interface AskTableProps {
  interviewId: string;
  questions: DecisionQuestionRow[];
  onTakeRecommendation: (question: DecisionQuestionRow) => void;
  onSkip: (question: DecisionQuestionRow) => void;
  onHandBack: (question: DecisionQuestionRow) => void;
  onWrite: (
    question: DecisionQuestionRow,
    words: string,
    spoken: boolean,
  ) => void;
  /** Open this question on the one-per-screen view. */
  onOpen: (question: DecisionQuestionRow) => void;
  skipShipsRecommendation: boolean;
  lines: Record<string, { tone: "ok" | "warn"; text: string } | undefined>;
  busyId: string | null;
}

export function AskTable({
  interviewId,
  questions,
  onTakeRecommendation,
  onSkip,
  onHandBack,
  onWrite,
  onOpen,
  skipShipsRecommendation,
  lines,
  busyId,
}: AskTableProps) {
  const [writingId, setWritingId] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);

  return (
    <div className="max-w-[1180px] overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse bg-card text-[13px]">
        <thead>
          <tr>
            <Th className="w-[3rem]">#</Th>
            <Th className="w-[26%]">Question</Th>
            <Th className="w-[8rem]">Kind</Th>
            <Th className="w-[8rem]">Door</Th>
            <Th className="w-[11rem]">Verdict</Th>
            <Th className="w-[22%]">Answer</Th>
            <Th className="w-[16rem]">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {questions.map((question, index) => {
            const answered =
              question.answered_at !== null && question.verdict !== null;
            const line = lines[question.id];
            return (
              <tr
                key={question.id}
                className={cn(
                  "border-b border-border last:border-b-0",
                  answered && "bg-success/5",
                )}
              >
                <td className="px-2.5 py-2.5 align-top font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </td>
                <td className="px-2.5 py-2.5 align-top">
                  <button
                    type="button"
                    onClick={() => onOpen(question)}
                    className="qd-editorial rounded text-left text-[14px] leading-snug font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {question.title}
                  </button>
                </td>
                <td className="px-2.5 py-2.5 align-top text-muted-foreground">
                  {question.kind
                    ? (KIND_LABEL[question.kind] ?? question.kind)
                    : "—"}
                </td>
                <td className="px-2.5 py-2.5 align-top">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px] tracking-[0.09em] uppercase",
                      question.door === "one_way"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {DOOR_LABEL[question.door] ?? question.door}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 align-top text-foreground/80">
                  {answered
                    ? (VERDICT_LABEL[question.verdict as Verdict] ?? "Answered")
                    : "—"}
                </td>
                <td className="px-2.5 py-2.5 align-top text-foreground/80">
                  <span className="line-clamp-3 whitespace-pre-wrap">
                    {question.answer_text ?? "—"}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {question.recommendation ? (
                      <Mini
                        busy={busyId === question.id}
                        onClick={() => onTakeRecommendation(question)}
                      >
                        1
                      </Mini>
                    ) : null}
                    <Mini
                      busy={busyId === question.id}
                      onClick={() => onSkip(question)}
                      title={
                        skipShipsRecommendation
                          ? "Skip — ship the recommendation"
                          : "Skip — defer"
                      }
                    >
                      2
                    </Mini>
                    <Mini
                      busy={busyId === question.id}
                      onClick={() => onHandBack(question)}
                      title="Not mine — you decide"
                    >
                      3
                    </Mini>
                    <Mini
                      busy={busyId === question.id}
                      onClick={() => {
                        setWritingId(question.id);
                        setWords(question.answer_text ?? "");
                        setSpoken(false);
                        setWordsError(null);
                      }}
                      title="Write an answer"
                    >
                      W
                    </Mini>
                  </div>
                  {writingId === question.id ? (
                    <div className="mt-2">
                      {/* The platform field, so this inline box gets the same
                          mic, live transcription, cleanup and right-click menu
                          as the full write box. */}
                      <RecordingOriginProvider
                        origin={questionRecordingOrigin(
                          interviewId,
                          question.id,
                          question.title,
                        )}
                      >
                        <ProTextarea
                          autoFocus
                          value={words}
                          onChange={(event) => setWords(event.target.value)}
                          onTranscriptionComplete={() => setSpoken(true)}
                          placeholder="Typed or spoken. Recorded exactly as you give it."
                          autoGrow
                          minHeight={70}
                          maxHeight={220}
                          wrapperClassName="min-w-[240px]"
                        />
                      </RecordingOriginProvider>
                      <div className="mt-1.5 flex gap-1.5">
                        <Mini
                          busy={busyId === question.id}
                          onClick={() => {
                            if (words.length === 0) {
                              setWordsError(
                                "Write something first, or use one of the buttons.",
                              );
                              return;
                            }
                            setWordsError(null);
                            setWritingId(null);
                            onWrite(question, words, spoken);
                            setSpoken(false);
                          }}
                        >
                          Save
                        </Mini>
                        <Mini
                          busy={false}
                          onClick={() => {
                            setWritingId(null);
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
                        line.tone === "ok" ? "text-success" : "text-warning",
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
  busy,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-busy={busy}
      className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[12px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
