"use client";

/**
 * AgentEditRail — "Edit with AI" panel inside the Mermaid Workbench.
 *
 * The Scribe/Cleanup model applied to a diagram: pick an agent, type an
 * instruction, run it, watch the proposed diagram render live, then Apply
 * (saves as a new version through the normal editor flow) or Discard.
 */

import React, { useState } from "react";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { cn } from "@/lib/utils";

import { StandaloneMermaidView } from "../MermaidView";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { useMermaidAgentEdit } from "../hooks/useMermaidAgentEdit";

interface AgentEditRailProps {
  /** Current diagram source. */
  source: string;
  /** Builds the live surface scope at run time. */
  buildScope: () => ApplicationScope;
  /** Apply a proposed diagram (replaces editor source → saved as new version). */
  onApply: (source: string) => void;
  onClose: () => void;
}

export function AgentEditRail({ source, buildScope, onApply, onClose }: AgentEditRailProps) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentLabel, setAgentLabel] = useState<string>("Choose an agent…");
  const [instruction, setInstruction] = useState("");
  const { phase, isBusy, proposedSource, error, run, reset } = useMermaidAgentEdit();

  const canRun = !!agentId && instruction.trim().length > 0 && !isBusy;
  const hasProposal = Boolean(proposedSource);

  const handleRun = async () => {
    if (!agentId) return;
    const cid = await run({ agentId, instruction: instruction.trim(), source, scope: buildScope() });
    if (!cid) toast.error("Couldn't start the agent");
  };

  const handleApply = () => {
    if (!proposedSource) return;
    onApply(proposedSource);
    toast.success("Applied — saved as a new version");
    setInstruction("");
    reset();
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-l border-border bg-card sm:w-80">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          Edit with AI
        </span>
        <SimpleTooltip text="Close AI panel">
          <button
            type="button"
            aria-label="Close AI panel"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </SimpleTooltip>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Agent</label>
          <AgentListDropdown
            label={agentLabel}
            className="w-full"
            onSelect={(id) => {
              setAgentId(id);
              setAgentLabel("Agent selected");
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            What should change?
          </label>
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make the happy path green and add a retry step after failure"
            rows={3}
            className="resize-none text-base sm:text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) {
                e.preventDefault();
                void handleRun();
              }
            }}
          />
        </div>

        <Button onClick={handleRun} disabled={!canRun} className="w-full gap-1.5">
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          {isBusy ? "Working…" : "Generate"}
        </Button>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}

        {(isBusy || hasProposal) && (
          <div className="min-h-0 flex-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Preview</span>
              {isBusy && <PhaseLabel phase={phase} />}
            </div>
            <div
              className={cn(
                "rounded-md border border-border bg-background p-1",
                hasProposal ? "" : "min-h-24",
              )}
            >
              {hasProposal ? (
                <StandaloneMermaidView source={proposedSource!} />
              ) : (
                <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                  {isBusy ? "Generating diagram…" : "The proposed diagram appears here"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {hasProposal && !isBusy && (
        <div className="flex items-center gap-2 border-t border-border p-3">
          <Button variant="outline" className="flex-1 gap-1.5" onClick={() => reset()}>
            <X className="h-3.5 w-3.5" />
            Discard
          </Button>
          <Button className="flex-1 gap-1.5" onClick={handleApply}>
            <Check className="h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

function PhaseLabel({ phase }: { phase: string }) {
  const label =
    phase === "streaming"
      ? "Drawing…"
      : phase === "connecting" || phase === "pending" || phase === "launching"
        ? "Starting…"
        : phase === "awaiting-tools"
          ? "Thinking…"
          : phase;
  return <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>;
}
