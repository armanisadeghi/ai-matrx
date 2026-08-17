"use client";

/**
 * WalkInputCard — ONE input the inspected unit received on its turn.
 *
 * Renders the value READABLY through the canonical pipeline: markdown and
 * json go through `MarkdownStream` in persisted mode (the same
 * EnhancedChatMarkdown → BlockRenderer route streamed chat uses, so a
 * `__kind` payload upgrades to its registered kind component automatically);
 * plain text renders as text. Never a bespoke stream renderer.
 *
 * The producer edge is always shown WITH its confidence — `linked` (recorded
 * provenance) vs `inferred` (derived by position/adjacency) — as icon+word,
 * never color alone (D-40).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Link2, Wand2 } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DescendInput } from "../types";

/** Collapsed preview height — expand/collapse instead of a nested scroll
 * area (nested scrolling is banned on mobile). */
const COLLAPSED_MAX_PX = 176;

const PRODUCER_LABELS: Record<string, string> = {
  cx_request: "provider call",
  message: "message",
  request_snapshot: "request snapshot",
  tool_call: "tool call",
  agent: "agent definition",
  pending_injection: "injected context",
  context_slot: "context policy",
  user: "the user",
  // Workflow-step producers (C-27's wf_node_outcome layer, live 2026-08-17).
  workflow_node: "authored on the step",
  wf_node_outcome: "an earlier step",
  workflow_run: "the workflow run",
};

export function ConfidenceBadge({
  confidence,
}: {
  confidence: "linked" | "inferred";
}) {
  const linked = confidence === "linked";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        linked
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
      title={
        linked
          ? "Recorded provenance — this edge comes from stored ids, not a guess"
          : "Derived here — located by position or adjacency, not a recorded link"
      }
    >
      {linked ? (
        <Link2 className="h-3 w-3" aria-hidden />
      ) : (
        <Wand2 className="h-3 w-3" aria-hidden />
      )}
      {linked ? "linked" : "inferred"}
    </span>
  );
}

export interface WalkInputCardProps {
  input: DescendInput;
  disabled?: boolean;
  /** The user says THIS input is wrong. `note` is their optional comment. */
  onInputWrong: (input: DescendInput, note: string | null) => void;
}

function valueToRenderable(input: DescendInput): {
  mode: "markdown" | "text";
  content: string;
} {
  const raw = input.value;
  if (input.kind === "json") {
    const pretty =
      typeof raw === "string" ? raw : JSON.stringify(raw ?? null, null, 2);
    return { mode: "markdown", content: "```json\n" + pretty + "\n```" };
  }
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "", null, 2);
  return input.kind === "markdown"
    ? { mode: "markdown", content: text }
    : { mode: "text", content: text };
}

export function WalkInputCard({ input, disabled, onInputWrong }: WalkInputCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const rendered = useMemo(() => valueToRenderable(input), [input]);
  const producerLabel =
    PRODUCER_LABELS[input.producer.kind] ?? input.producer.kind;
  const long = (input.chars ?? 0) > 600 || rendered.content.length > 600;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          {input.label}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {input.kind}
        </span>
        <span className="text-[10px] text-muted-foreground">
          from {producerLabel}
        </span>
        <ConfidenceBadge confidence={input.producer.confidence} />
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {(input.chars ?? 0).toLocaleString()} chars
          {input.truncated ? " · truncated" : ""}
        </span>
      </div>

      <div className="relative px-3 py-2">
        <div
          className={cn(!expanded && long && "overflow-hidden")}
          style={!expanded && long ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        >
          {rendered.mode === "markdown" ? (
            <MarkdownStream
              content={rendered.content}
              isStreamActive={false}
              hideCopyButton
            />
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm text-foreground">
              {rendered.content}
            </div>
          )}
        </div>
        {!expanded && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>

      {long && (
        <div className="px-3 pb-1">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {expanded ? "Show less" : "Show all"}
          </button>
        </div>
      )}

      {input.truncated && input.value_ref && (
        <div className="px-3 pb-1 text-[10px] text-muted-foreground">
          Shown truncated — full payload lives at {input.value_ref}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
          disabled={disabled}
          onClick={() => onInputWrong(input, note.trim() ? note.trim() : null)}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          This input is wrong
        </Button>
        <button
          type="button"
          className="h-9 px-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setNoteOpen((v) => !v)}
        >
          {noteOpen ? "Hide note" : "Add a note"}
        </button>
        {noteOpen && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this input wrong? (optional)"
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-base text-foreground placeholder:text-muted-foreground"
            style={{ fontSize: "16px" }}
          />
        )}
      </div>
    </div>
  );
}
