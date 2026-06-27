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
 * (`min-h-[460px]`) and is a positioning context. The Manual / extra tabs render
 * in normal flow; the AI pane fills the floor via `absolute inset-0` because the
 * agent runner is built entirely from absolutely-positioned children and so has
 * zero intrinsic height — and `h-full` would collapse to 0 in auto-height chrome
 * (Dialog/Drawer set only `max-h`, not a definite `height`, and percentage
 * heights ignore `min-height`). Filling the rendered box keeps the agent visible
 * in modal/drawer chrome, not just the definite-height WindowPanel. BOTH tabs
 * stay mounted once visited (the AI tab is lazy-mounted on first use, then
 * retained), toggled with `hidden`, so switching never resizes, flashes, or
 * remounts the agent — the chrome around it stays still.
 *
 * Mobile note: the switcher is a two-option segmented toggle, not a tab strip —
 * Manual and Use AI are mutually-exclusive entry methods, never two sections of
 * the same content, so it doesn't trip the "no tabs on mobile" rule.
 */

import React, { useState, useEffect } from "react";
import { Cpu, PencilLine, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import {
  isProjectCreateFlow,
  logProjectCreateAiStage,
} from "@/features/projects/debug/projectCreateAiDebug";
import { AgentRunWrapper } from "./AgentRunWrapper";

export type CreateWithAiMode = string;

/**
 * An additional entry method beyond Manual / Use AI (e.g. "Paste JSON"). Each
 * extra tab is lazy-mounted on first visit then retained, exactly like the AI
 * tab, so switching never remounts or shifts layout. `id` must be unique and
 * not collide with "manual" / "ai".
 */
export interface CreateWithAiExtraTab {
  id: string;
  label: string;
  icon: LucideIcon;
  content: React.ReactNode;
  /** Whether this tab owns a scroll area. Default true. */
  scrolls?: boolean;
  /** Optional pane class for feature-specific padding/sizing. */
  className?: string;
}

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
  /** Extra entry-method tabs rendered after Manual / Use AI. */
  extraTabs?: CreateWithAiExtraTab[];
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  manualPaneClassName?: string;
  aiPaneClassName?: string;
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
  extraTabs = [],
  className,
  headerClassName,
  bodyClassName,
  manualPaneClassName,
  aiPaneClassName,
}: CreateWithAiTabsProps) {
  const [mode, setMode] = useState<CreateWithAiMode>(defaultMode);
  // Lazy-mount each non-manual tab on first visit, then keep it mounted so
  // switching back and forth never relaunches the agent or shifts layout.
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(
    () => new Set([defaultMode]),
  );

  useEffect(() => {
    if (
      defaultMode === "ai" &&
      enableAi &&
      isProjectCreateFlow(sourceFeature, agentId)
    ) {
      logProjectCreateAiStage("Use AI tab active on mount", {
        agentId,
        sourceFeature,
      });
    }
  }, [agentId, defaultMode, enableAi, sourceFeature]);

  const scrollManual = manualScrolls ?? !isMobile;

  // With AI off and no extra tabs, there's only one entry method — skip chrome.
  if (!enableAi && extraTabs.length === 0) {
    return <>{manual}</>;
  }

  const selectMode = (next: CreateWithAiMode) => {
    if (next === "ai" && isProjectCreateFlow(sourceFeature, agentId)) {
      logProjectCreateAiStage("Use AI tab selected", {
        agentId,
        sourceFeature,
        alreadyMounted: mountedTabs.has("ai"),
      });
    }
    setMountedTabs((prev) => {
      if (prev.has(next)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(next);
      return nextSet;
    });
    setMode(next);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className={cn("flex-shrink-0 px-1 pb-3", headerClassName)}>
        <div className="inline-flex w-full items-center gap-1 rounded-lg bg-muted p-1">
          <ModeButton
            active={mode === "manual"}
            onClick={() => selectMode("manual")}
            icon={PencilLine}
            label={manualLabel}
            isMobile={isMobile}
          />
          {enableAi && (
            <ModeButton
              active={mode === "ai"}
              onClick={() => selectMode("ai")}
              icon={Cpu}
              label={aiLabel}
              isMobile={isMobile}
            />
          )}
          {extraTabs.map((tab) => (
            <ModeButton
              key={tab.id}
              active={mode === tab.id}
              onClick={() => selectMode(tab.id)}
              icon={tab.icon}
              label={tab.label}
              isMobile={isMobile}
            />
          ))}
        </div>
      </div>

      {/*
       * Constant height floor → tab switches never resize the chrome.
       *
       * `relative` is load-bearing: the AI pane (AgentRunner) is built entirely
       * out of absolutely-positioned children and contributes zero intrinsic
       * height, so it needs a definite-height positioning context to fill. We
       * give the AI pane `absolute inset-0` rather than `h-full` because CSS
       * `height:100%` resolves against the parent's computed `height` (not its
       * `min-height`) — in auto-height chrome (Dialog/Drawer, which only set
       * `max-h`) `h-full` collapses to 0 and the agent renders blank. `inset-0`
       * fills the rendered box (which DOES honor `min-h-[460px]`), so the agent
       * shows in modal/drawer chrome too — not just the definite-height
       * WindowPanel. The Manual tab stays in normal flow so the dialog still
       * grows to fit the hand-authored form.
       */}
      <div className={cn("relative flex-1 min-h-[460px]", bodyClassName)}>
        <div
          className={cn(
            "h-full min-h-0",
            scrollManual && "overflow-y-auto",
            manualPaneClassName,
            mode !== "manual" && "hidden",
          )}
        >
          {manual}
        </div>

        {enableAi && mountedTabs.has("ai") && (
          <div
            className={cn(
              "absolute inset-0",
              aiPaneClassName,
              mode !== "ai" && "hidden",
            )}
          >
            <AgentRunWrapper
              agentId={agentId}
              sourceFeature={sourceFeature}
              onRunComplete={onAiRunComplete}
            />
          </div>
        )}

        {extraTabs.map(
          (tab) =>
            mountedTabs.has(tab.id) && (
              <div
                key={tab.id}
                className={cn(
                  "h-full min-h-0",
                  (tab.scrolls ?? true) && "overflow-y-auto",
                  tab.className,
                  mode !== tab.id && "hidden",
                )}
              >
                {tab.content}
              </div>
            ),
        )}
      </div>
    </div>
  );
}
