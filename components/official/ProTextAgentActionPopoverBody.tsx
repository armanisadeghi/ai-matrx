"use client";

/**
 * Shared streamed-result view for ProInput and ProTextarea agent actions.
 * The host owns agent selection, execution, comparison, and applying the result.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import {
  Check,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { CheckTapButton, CopyTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import type { useProTextareaAgentAction } from "./useProTextareaAgentAction";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";

import { Button } from "@ai-matrx/design-system/controls";
export function ProTextAgentActionPopoverBody({
  title,
  phase,
  isBusy,
  isThinking,
  result,
  error,
  agentName,
  onSelectAgent,
  onRun,
  canRun,
  onApply,
  onCompare,
  onBack,
  onCancel,
}: {
  title: string;
  phase: ReturnType<typeof useProTextareaAgentAction>["phase"];
  isBusy: boolean;
  isThinking: boolean;
  result: string;
  error: string | null;
  agentName: string | null;
  onSelectAgent: (agentId: string) => void;
  onRun: () => void;
  canRun: boolean;
  onApply: () => void;
  onCompare?: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [resultCopied, setResultCopied] = useState(false);
  const isError = phase === "error" || phase === "timeout";
  const isComplete = phase === "complete";
  const hasResult = result.trim().length > 0;
  const hasRun = phase !== "idle";

  const handleCopyResult = async () => {
    if (!(await copyText(kindTextToMarkdown(result), `${title} result copied to clipboard`))) return;
    setResultCopied(true);
    window.setTimeout(() => setResultCopied(false), 1500);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 type-secondary font-semibold text-foreground">
          <AGENT_ICON className="h-3.5 w-3.5 text-primary" />
          {title}
          {isBusy && (
            <span className="ml-1 inline-flex items-center gap-1 type-meta font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isThinking ? "Thinking…" : "Working…"}
            </span>
          )}
        </div>
        <Button variant="quiet" icon={<X />} aria-label="Close" onClick={onCancel} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <AgentListDropdown
            onSelect={onSelectAgent}
            label={agentName ?? "Choose an agent…"}
            className="w-full"
          />
        </div>
        <Button
          variant="primary"
          className="shrink-0"
          onClick={onRun}
          disabled={!canRun}
          icon={isBusy ? <Loader2 className="animate-spin" /> : hasRun ? <RotateCcw /> : <AGENT_ICON />}
        >
          {hasRun ? "Re-run" : "Run"}
        </Button>
      </div>

      {hasRun && (
        <div className="max-h-56 min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          {isError ? (
            <p className="type-secondary text-destructive">
              {error ?? "Something went wrong. Please try again."}
              <ErrorAlchemyMenu error={error} />
            </p>
          ) : hasResult ? (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 type-body leading-relaxed text-foreground">
                <AnswerValueView text={result} />
              </div>
              <div className="sticky top-0 shrink-0">
                {resultCopied ? (
                  <CheckTapButton
                    variant="transparent"
                    onClick={handleCopyResult}
                    ariaLabel={`${title} result copied`}
                    className="text-primary"
                  />
                ) : (
                  <CopyTapButton
                    variant="transparent"
                    onClick={handleCopyResult}
                    ariaLabel={`Copy ${title.toLowerCase()} result`}
                    className="text-muted-foreground"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4 type-secondary text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing your text…
            </div>
          )}
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2">
        <Button variant="quiet" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-1.5">
          <Button variant="quiet" onClick={onCancel}>Cancel</Button>
          {onCompare && isComplete && hasResult && (
            <Button variant="quiet" icon={<GitCompareArrows />} onClick={onCompare} title="Compare your current text with the AI result before applying">Compare</Button>
          )}
          <Button
            variant="primary"
            onClick={onApply}
            disabled={!isComplete || !hasResult}
            icon={<Check />}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
