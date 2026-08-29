"use client";

/**
 * Shared streamed-result view for ProInput and ProTextarea agent actions.
 * The host owns agent selection, execution, comparison, and applying the result.
 */

import { useState } from "react";
import {
  BrainCircuit,
  Check,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { CheckTapButton, CopyTapButton } from "@ai-matrx/tap-target/buttons";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { useProTextareaAgentAction } from "./useProTextareaAgentAction";

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
  const [resultCopied, setResultCopied] = useState(false);
  const isError = phase === "error" || phase === "timeout";
  const isComplete = phase === "complete";
  const hasResult = result.trim().length > 0;
  const hasRun = phase !== "idle";

  const handleCopyResult = async () => {
    await writeClipboard(result);
    setResultCopied(true);
    toast.success(`${title} result copied to clipboard`);
    window.setTimeout(() => setResultCopied(false), 1500);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <BrainCircuit className="h-3.5 w-3.5 text-primary" />
          {title}
          {isBusy && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isThinking ? "Thinking…" : "Working…"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <AgentListDropdown
            onSelect={onSelectAgent}
            label={agentName ?? "Choose an agent…"}
            className="w-full"
          />
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
            !canRun
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasRun ? (
            <RotateCcw className="h-3.5 w-3.5" />
          ) : (
            <BrainCircuit className="h-3.5 w-3.5" />
          )}
          {hasRun ? "Re-run" : "Run"}
        </button>
      </div>

      {hasRun && (
        <div className="max-h-56 overflow-y-auto px-3 py-2.5">
          {isError ? (
            <p className="text-xs text-destructive">
              {error ?? "Something went wrong. Please try again."}
            </p>
          ) : hasResult ? (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {result}
              </p>
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
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing your text…
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Back
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          {onCompare && isComplete && hasResult && (
            <button
              type="button"
              onClick={onCompare}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Compare your current text with the AI result before applying"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare
            </button>
          )}
          <button
            type="button"
            onClick={onApply}
            disabled={!isComplete || !hasResult}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              !isComplete || !hasResult
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
