"use client";

/**
 * CreateWithAiTabs
 *
 * Generic two-mode "create something" body: a hand-authored **Manual** form
 * alongside a **Use AI** tab driven by an agent. Reusable across features
 * (projects, tasks, …) — pass the manual form as `manual`, plus the agent
 * `agentId` + `sourceFeature` that powers the AI tab.
 *
 * Layout contract (the load-bearing part): the body has a constant height floor
 * and BOTH tabs stay mounted once visited (the AI tab is lazy-mounted on first
 * use, then retained), toggled with `hidden`. Switching tabs therefore never
 * resizes, flashes, or remounts the agent — the chrome around it (modal, window,
 * route) stays perfectly still.
 *
 * Mobile note: the switcher is a two-option segmented toggle, not a tab strip —
 * Manual and Use AI are mutually-exclusive entry methods, never two sections of
 * the same content, so it doesn't trip the "no tabs on mobile" rule.
 */

import React, { useState } from "react";
import { PencilLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { AgentRunWrapper } from "./AgentRunWrapper";

export type CreateWithAiMode = "manual" | "ai";

export interface CreateWithAiTabsProps {
  /** The hand-authored form rendered in the "Manual" tab. */
  manual: React.ReactNode;
  /** Agent powering the "Use AI" tab. */
  agentId: string;
  sourceFeature: SourceFeature;
  /**
   * Fired on each AI run completion (status running/streaming → "complete").
   * The agent writes server-side, so use this to refresh whatever it changed.
   */
  onAiRunComplete?: () => void;
  /** Show the "Use AI" mode + switcher. Default true. */
  enableAi?: boolean;
  /** Which mode is selected on mount. Default "manual". */
  defaultMode?: CreateWithAiMode;
  isMobile?: boolean;
  /**
   * Whether the manual tab owns a scroll area. Defaults to desktop-only — on
   * mobile the manual form usually owns its own scroll, so nesting one here
   * would double-scroll.
   */
  manualScrolls?: boolean;
  manualLabel?: string;
  aiLabel?: string;
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  isMobile,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof PencilLine;
  label: string;
  isMobile: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        isMobile && "min-h-[40px]",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function CreateWithAiTabs({
  manual,
  agentId,
  sourceFeature,
  onAiRunComplete,
  enableAi = true,
  defaultMode = "manual",
  isMobile = false,
  manualScrolls,
  manualLabel = "Manual",
  aiLabel = "Use AI",
}: CreateWithAiTabsProps) {
  const [mode, setMode] = useState<CreateWithAiMode>(defaultMode);
  // Lazy-mount the AI tab on first visit, then keep it mounted so switching
  // back and forth never relaunches the agent or shifts layout.
  const [aiMounted, setAiMounted] = useState(defaultMode === "ai");

  const scrollManual = manualScrolls ?? !isMobile;

  if (!enableAi) {
    return <>{manual}</>;
  }

  const selectMode = (next: CreateWithAiMode) => {
    if (next === "ai") setAiMounted(true);
    setMode(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 px-1 pb-3">
        <div className="inline-flex w-full items-center gap-1 rounded-lg bg-muted p-1">
          <ModeButton
            active={mode === "manual"}
            onClick={() => selectMode("manual")}
            icon={PencilLine}
            label={manualLabel}
            isMobile={isMobile}
          />
          <ModeButton
            active={mode === "ai"}
            onClick={() => selectMode("ai")}
            icon={Sparkles}
            label={aiLabel}
            isMobile={isMobile}
          />
        </div>
      </div>

      {/* Constant height floor → tab switches never resize the chrome. */}
      <div className="flex-1 min-h-[460px]">
        <div
          className={cn(
            "h-full min-h-0",
            scrollManual && "overflow-y-auto",
            mode !== "manual" && "hidden",
          )}
        >
          {manual}
        </div>

        {aiMounted && (
          <div className={cn("h-full min-h-0", mode !== "ai" && "hidden")}>
            <AgentRunWrapper
              agentId={agentId}
              sourceFeature={sourceFeature}
              onRunComplete={onAiRunComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
}
