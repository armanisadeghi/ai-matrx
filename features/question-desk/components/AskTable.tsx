"use client";

// The ask-mode table intentionally retains its in-row answer editor. A person
// can resolve several questions without leaving the table; the canonical table
// supplies the surrounding search, filters, density, footer, and column tools.

import { useState, type ReactNode } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { ProTextarea } from "@/components/official/ProTextarea";
import { RecordingOriginProvider } from "@/features/audio/RecordingOriginProvider";
import { cn } from "@/lib/utils";
import { NO_WORDS_MESSAGE, hasWords } from "../answerWords";
import { questionRecordingOrigin } from "../hooks/useDictationAudio";
import {
  DOOR_LABEL,
  KIND_LABEL,
  VERDICT_LABEL,
  type DecisionQuestionRow,
  type Verdict,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface AskTableProps {
  interviewId: string;
  questions: DecisionQuestionRow[];
  onTakeRecommendation: (question: DecisionQuestionRow) => void;
  onSkip: (question: DecisionQuestionRow) => void;
  onHandBack: (question: DecisionQuestionRow) => void;
  onWrite: (question: DecisionQuestionRow, words: string, spoken: boolean) => void;
  /** Open this question on the one-per-screen view. */
  onOpen: (question: DecisionQuestionRow) => void;
  skipShipsRecommendation: boolean;
  lines: Record<string, { tone: "ok" | "warn"; text: string } | undefined>;
  busyId: string | null;
}

function verdictLabel(question: DecisionQuestionRow) {
  return question.verdict
    ? (VERDICT_LABEL[question.verdict as Verdict] ?? question.verdict)
    : "Unanswered";
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

  const columns: MatrxColumnDef<DecisionQuestionRow>[] = [
    {
      id: "question",
      accessorKey: "title",
      header: "Question",
      label: "Question",
      width: 300,
      minWidth: 220,
      cell: (question) => (
        <button
          type="button"
          onClick={() => onOpen(question)}
          className="qd-editorial block w-full truncate rounded text-left text-sm leading-snug font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          title={question.title}
        >
          {question.title}
        </button>
      ),
    },
    {
      id: "kind",
      accessorKey: "kind",
      header: "Kind",
      label: "Kind",
      filter: "select",
      filterValue: (question) => question.kind ?? "",
      cell: (question) => question.kind ? (KIND_LABEL[question.kind] ?? question.kind) : "—",
      width: 120,
      mobileHidden: true,
    },
    {
      id: "door",
      accessorKey: "door",
      header: "Door",
      label: "Door",
      filter: "select",
      cell: (question) => (
        <span
          className={cn(
            "whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] tracking-[0.09em] uppercase",
            question.door === "one_way"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          {DOOR_LABEL[question.door] ?? question.door}
        </span>
      ),
      width: 130,
      mobileHidden: true,
    },
    {
      id: "verdict",
      accessorFn: verdictLabel,
      header: "Verdict",
      label: "Verdict",
      filter: "select",
      cell: (question) => question.verdict ? verdictLabel(question) : "—",
      width: 180,
      mobileHidden: true,
    },
    {
      id: "status-note",
      accessorKey: "status_note",
      header: "Status note",
      label: "Status note",
      cell: (question) =>
        question.status_note ? (
          <span
            className="block truncate font-mono text-[10.5px] text-muted-foreground"
            title={question.recorded_in ?? question.status_note}
            aria-live="polite"
          >
            {question.status_note}
          </span>
        ) : (
          "—"
        ),
      width: 190,
      mobileHidden: true,
    },
    {
      id: "answer",
      accessorKey: "answer_text",
      header: "Answer",
      label: "Answer",
      cell: (question) => (
        <span className="block max-w-[320px] truncate whitespace-pre-wrap" title={question.answer_text ?? undefined}>
          {question.answer_text ?? "—"}
        </span>
      ),
      width: 280,
    },
  ];

  return (
    <MatrxDataTable<DecisionQuestionRow>
      data={questions}
      columns={columns}
      getRowId={(question) => question.id}
      density="condensed"
      pageSize={25}
      pageSizeOptions={[10, 25, 50]}
      detail={{ enabled: false }}
      copy={false}
      toolbar={{
        title: "Every question at once",
        search: true,
        searchPlaceholder: "Search questions and answers…",
      }}
      emptyState={{
        title: "No open questions",
        description: "Questions appear here when the desk needs your decision.",
      }}
      rowClassName={(question) =>
        question.answered_at !== null && question.verdict !== null
          ? "bg-success/5"
          : undefined
      }
      rowActions={(question) => {
        const line = lines[question.id];
        const writing = writingId === question.id;
        return (
          <div className="min-w-[188px]">
            <div className="flex flex-nowrap gap-1.5">
              {question.recommendation ? (
                <Mini busy={busyId === question.id} onClick={() => onTakeRecommendation(question)} title="Take recommendation">
                  1
                </Mini>
              ) : null}
              <Mini
                busy={busyId === question.id}
                onClick={() => onSkip(question)}
                title={skipShipsRecommendation ? "Skip — ship the recommendation" : "Skip — defer"}
              >
                2
              </Mini>
              <Mini busy={busyId === question.id} onClick={() => onHandBack(question)} title="Not mine — you decide">
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
            {writing ? (
              <div className="mt-2">
                <RecordingOriginProvider origin={questionRecordingOrigin(interviewId, question.id, question.title)}>
                  <ProTextarea
                    autoFocus
                    value={words}
                    onChange={(event) => setWords(event.target.value)}
                    onTranscriptionComplete={() => setSpoken(true)}
                    onTranscriptionError={(message) => setWordsError(message)}
                    placeholder="Typed or spoken. Recorded exactly as you give it."
                    autoGrow
                    minHeight={70}
                    maxHeight={220}
                    wrapperClassName="w-[320px] max-w-[70vw]"
                  />
                </RecordingOriginProvider>
                <div className="mt-1.5 flex gap-1.5">
                  <Mini
                    busy={busyId === question.id}
                    onClick={() => {
                      if (!hasWords(words)) {
                        setWordsError(NO_WORDS_MESSAGE);
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
                {wordsError ? <p className="mt-1 font-mono text-[10.5px] text-warning">{wordsError} <ErrorAlchemyMenu error={wordsError} /></p> : null}
              </div>
            ) : null}
            {line ? (
              <p className={cn("mt-1 font-mono text-[10.5px]", line.tone === "ok" ? "text-success" : "text-warning")}>
                {line.text}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function Mini({ children, onClick, busy, title }: { children: ReactNode; onClick: () => void; busy: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-busy={busy}
      disabled={busy}
      className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
