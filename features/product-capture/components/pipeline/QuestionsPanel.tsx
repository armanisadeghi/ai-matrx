"use client";

/**
 * QuestionsPanel — the human-in-the-loop cycle on the desktop workspace:
 * open questions answered inline, deferred ones visible with their reason,
 * answered history, add-your-own, and the Resubmit action (stage → research)
 * once answers are in.
 */

import React, { useState } from "react";
import { CircleHelp, CornerDownRight, Plus, RotateCcw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { PipelineQuestion } from "../../pipeline-service";
import { CommitField, PanelSection } from "./panel-primitives";

const STATUS_LABEL: Record<PipelineQuestion["status"], string> = {
  open: "Open",
  answered: "Answered",
  deferred: "Deferred",
  resolved: "Resolved",
};

export function QuestionsPanel({
  questions,
  onAnswer,
  onDefer,
  onReopen,
  onAdd,
  onResubmit,
  canResubmit,
}: {
  questions: PipelineQuestion[];
  onAnswer: (q: PipelineQuestion, answer: string) => Promise<void>;
  onDefer: (q: PipelineQuestion, reason?: string) => Promise<void>;
  onReopen: (q: PipelineQuestion) => Promise<void>;
  onAdd: (prompt: string) => Promise<void>;
  onResubmit: () => Promise<void>;
  canResubmit: boolean;
}) {
  const [newPrompt, setNewPrompt] = useState("");
  const open = questions.filter((q) => q.status === "open");
  const answered = questions.filter((q) => q.status === "answered");
  const rest = questions.filter(
    (q) => q.status === "deferred" || q.status === "resolved",
  );

  return (
    <PanelSection
      title="Questions"
      badge={
        open.length > 0 ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
            {open.length} open
          </span>
        ) : undefined
      }
      actions={
        canResubmit ? (
          <Button
            size="sm"
            className="h-8"
            disabled={answered.length === 0}
            onClick={() => void onResubmit()}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Resubmit to agents
          </Button>
        ) : undefined
      }
    >
      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No questions — the agents had everything they needed so far.
        </p>
      )}

      {[...open, ...answered, ...rest].map((q) => (
        <QuestionRow
          key={q.id}
          question={q}
          onAnswer={onAnswer}
          onDefer={onDefer}
          onReopen={onReopen}
        />
      ))}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <CircleHelp className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          placeholder="Add a note or question for the agents…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newPrompt.trim()) {
              void onAdd(newPrompt.trim());
              setNewPrompt("");
            }
          }}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={!newPrompt.trim()}
          onClick={() => {
            void onAdd(newPrompt.trim());
            setNewPrompt("");
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </PanelSection>
  );
}

function QuestionRow({
  question,
  onAnswer,
  onDefer,
  onReopen,
}: {
  question: PipelineQuestion;
  onAnswer: (q: PipelineQuestion, answer: string) => Promise<void>;
  onDefer: (q: PipelineQuestion, reason?: string) => Promise<void>;
  onReopen: (q: PipelineQuestion) => Promise<void>;
}) {
  const isOpen = question.status === "open";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isOpen ? "border-warning/50 bg-warning/5" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{question.prompt}</p>
          {question.context && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {question.context}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            isOpen
              ? "bg-warning/15 text-warning"
              : "bg-muted text-muted-foreground",
          )}
        >
          {STATUS_LABEL[question.status]}
        </span>
      </div>

      {isOpen ? (
        <div className="mt-2 space-y-2">
          {question.kind === "choice" && question.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((o) => (
                <Button
                  key={o.value}
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void onAnswer(question, o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          ) : question.kind === "boolean" ? (
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void onAnswer(question, "yes")}
              >
                Yes
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void onAnswer(question, "no")}
              >
                No
              </Button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <AnswerField
              onSubmit={(v) => void onAnswer(question, v)}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 text-muted-foreground"
              onClick={() => void onDefer(question, "Not a quick answer")}
            >
              Not a quick answer
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {question.status === "deferred"
                ? (question.deferredReason ?? "Deferred")
                : (question.answer ?? "—")}
            </span>
          </p>
          {question.status !== "resolved" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-muted-foreground"
              onClick={() => void onReopen(question)}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AnswerField({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder="Type an answer and press Enter…"
      onKeyDown={(e) => {
        if (e.key === "Enter" && draft.trim()) {
          onSubmit(draft.trim());
          setDraft("");
        }
      }}
      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
