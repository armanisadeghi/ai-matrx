"use client";
import React, { useState } from "react";
import { ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import { Input, DisclosureHeader } from "@ai-matrx/design-system/controls";
import { Button } from "@ai-matrx/design-system";
import { useAppDispatch } from "@/lib/redux/hooks";
import { stageRemark } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";

export interface DisplayQuestionnaireBlockProps {
  introduction: string;
  questions?: Record<string, unknown>[];
  /** In a chat answer: the person can answer and Submit (rides the next message). */
  conversationId?: string;
  messageId?: string;
  blockIndex?: number;
}

function questionText(q: Record<string, unknown>): string | undefined {
  const text = q.text ?? q.prompt ?? q.question ?? q.label ?? q.title;
  return typeof text === "string" ? text : undefined;
}

function optionLabels(q: Record<string, unknown>): string[] {
  if (!Array.isArray(q.options)) return [];
  return q.options.flatMap((o) => {
    if (typeof o === "string") return [o];
    if (o && typeof o === "object") {
      const label = (o as Record<string, unknown>).label ?? (o as Record<string, unknown>).name ?? (o as Record<string, unknown>).value;
      return typeof label === "string" ? [label] : [];
    }
    return [];
  });
}

const DisplayQuestionnaireBlock: React.FC<DisplayQuestionnaireBlockProps> = ({
  introduction,
  questions = [],
  conversationId,
  messageId,
  blockIndex,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const dispatch = useAppDispatch();
  const answerable = !!conversationId && !!messageId;
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<string | null>(null);
  const pairs = questions.flatMap((q, i) => {
    const question = questionText(q);
    const answer = answers[i]?.trim();
    return question && answer ? [{ question, answer }] : [];
  });
  const pairsKey = JSON.stringify(pairs);
  const submit = () => {
    if (!conversationId || !messageId || pairs.length === 0) return;
    dispatch(
      stageRemark(
        conversationId,
        {
          kind: "answers",
          target: { conversationId, messageId, blockIndex: blockIndex ?? null },
          title: introduction.trim() ? introduction.trim().slice(0, 80) : null,
          answers: pairs,
        },
        { coalesceKey: `answers:${messageId}:${blockIndex ?? 0}` },
      ),
    );
    setSubmitted(pairsKey);
  };

  return (
    <div className="rounded-lg border bg-card my-2 overflow-hidden">
      <DisclosureHeader
        className="w-full"
        open={isExpanded}
        onClick={() => setIsExpanded((v) => !v)}
        icon={<ClipboardList />}
        title="Questionnaire"
        meta={questions.length > 0 ? `${questions.length} question${questions.length !== 1 ? "s" : ""}` : undefined}
      />

      {isExpanded && (
        <div className="border-t border-border/40 px-3 py-3 space-y-3">
          {introduction && (
            <p className="text-sm text-foreground leading-relaxed">
              {introduction}
            </p>
          )}
          {questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((q, i) => {
                const text = questionText(q);
                const options = optionLabels(q);
                const type = (q.type ?? q.input_type) as string | undefined;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded bg-muted/40 px-2.5 py-2"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-5 flex-shrink-0 mt-0.5">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground">
                        {text ?? JSON.stringify(q)}
                      </span>
                      {type && !answerable && (
                        <span className="ml-2 text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded font-mono">
                          {type}
                        </span>
                      )}
                      {answerable && options.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {options.map((label) => (
                            <Button
                              key={label}
                              size="sm"
                              variant={answers[i] === label ? "default" : "outline"}
                              onClick={() => setAnswers((prev) => ({ ...prev, [i]: label }))}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {answerable && options.length === 0 ? (
                        <Input
                          className="mt-1.5"
                          value={answers[i] ?? ""}
                          placeholder="Your answer"
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswers((prev) => ({ ...prev, [i]: value }));
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {answerable && questions.length > 0 ? (
            <div className="flex items-center justify-end gap-2">
              {submitted === pairsKey ? (
                <span className="text-xs text-muted-foreground">Added to your next message</span>
              ) : null}
              <Button size="sm" onClick={submit} disabled={pairs.length === 0 || submitted === pairsKey}>
                {submitted ? "Update" : "Submit"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default DisplayQuestionnaireBlock;
