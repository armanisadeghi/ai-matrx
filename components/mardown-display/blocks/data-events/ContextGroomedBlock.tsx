"use client";
import React from "react";
import { Sparkles } from "lucide-react";

/**
 * ContextGroomedBlock — the subtle "context compacted" indicator for a
 * `value_store.groomed` stream event.
 *
 * Groom stamps swapped the MODEL's view of the listed tool results for
 * compact stubs. The user-facing transcript is UNCHANGED (tool output still
 * reads from cx_tool_call.output) — this line is deliberately quiet: a
 * one-line receipt, never a card that draws attention.
 *
 * Contract: aidream services/conversation_values/FEATURE.md (Grooming) +
 * docs/cx_chat/FE_HANDOFF_AGENT_PATTERNS.md §3.
 */
export interface ContextGroomedBlockProps {
  stubbedKeys?: string[];
  retainedKeys?: string[];
}

const ContextGroomedBlock: React.FC<ContextGroomedBlockProps> = ({
  stubbedKeys = [],
  retainedKeys = [],
}) => {
  const stubbed = stubbedKeys.length;
  const retained = retainedKeys.length;
  return (
    <div className="my-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3 shrink-0" />
      <span>
        Context compacted
        {stubbed > 0
          ? ` · ${stubbed} result${stubbed === 1 ? "" : "s"} stubbed`
          : ""}
        {retained > 0 ? ` · ${retained} retained` : ""}
      </span>
    </div>
  );
};

export default ContextGroomedBlock;
