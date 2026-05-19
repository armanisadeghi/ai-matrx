/**
 * activeBattleColumns
 *
 * Cross-mode column resolver. Every comparison mode owns its own slice
 * (`agentComparison`, `agentComparisonSettings`, `agentComparisonSystemPrompt`,
 * `agentComparisonTools`, `agentComparisonRequestMod`) — but the shared
 * surfaces (ResponseFeedbackBar, RunsComparisonTable, SharedRunsWindow)
 * need a uniform column list to operate on regardless of which mode is
 * currently mounted.
 *
 * `selectActiveBattleColumns` returns the active mode's columns as a
 * generic `BattleColumnDescriptor[]`. It picks the first non-empty
 * slice in mode-priority order, falling back to the Open-mode columns.
 * Since only one comparison route is mounted at a time, the picked
 * slice is always the one the user is looking at.
 *
 * Why a single shared selector and not a per-mode prop:
 *   - keeps the shared surfaces drop-in across every mode (`<RunsComparisonTable />`
 *     just works) without each page wiring its own column list
 *   - avoids a "battle-context" React context with provider plumbing
 *   - resolves bugs where the old code hard-coded the Open-mode selector
 *     and silently rendered empty in the other modes
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

export interface BattleColumnDescriptor {
  columnId: string;
  conversationId: string;
  /**
   * Display label. Open mode rarely sets a custom label so we leave it
   * undefined there (the table falls back to the agent's name); other
   * modes always carry the user-set variant label.
   */
  label?: string;
  /**
   * The agent id whose name should be looked up for display. For Open
   * mode this is the column's own agent id; for the locked-axis modes
   * it's the page-level locked source agent.
   */
  agentId: string | null;
  /**
   * Pinned version for display ("current" / number / null).
   */
  agentVersion: "current" | number | null;
  /**
   * Mode that produced this descriptor — useful for any mode-specific
   * downstream rendering (e.g. tools-mode could surface tools chips in
   * the Runs header). Not used today but kept for symmetry.
   */
  mode:
    | "open"
    | "settings"
    | "model"
    | "tuning"
    | "system-prompt"
    | "tools"
    | "request-mod";
}

const EMPTY: BattleColumnDescriptor[] = [];

const selectOpen = (s: RootState) => s.agentComparison;
const selectSettings = (s: RootState) => s.agentComparisonSettings;
const selectModel = (s: RootState) => s.agentComparisonModel;
const selectTuning = (s: RootState) => s.agentComparisonTuning;
const selectSystemPrompt = (s: RootState) => s.agentComparisonSystemPrompt;
const selectTools = (s: RootState) => s.agentComparisonTools;
const selectRequestMod = (s: RootState) => s.agentComparisonRequestMod;

export const selectActiveBattleColumns = createSelector(
  [
    selectOpen,
    selectSettings,
    selectModel,
    selectTuning,
    selectSystemPrompt,
    selectTools,
    selectRequestMod,
  ],
  (open, settings, model, tuning, sp, tools, rm): BattleColumnDescriptor[] => {
    if (settings?.columns?.length) {
      const locked = settings.locked;
      return settings.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.agentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "settings" as const,
      }));
    }
    if (model?.columns?.length) {
      const locked = model.locked;
      return model.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.agentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "model" as const,
      }));
    }
    if (tuning?.columns?.length) {
      const locked = tuning.locked;
      return tuning.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.sourceAgentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "tuning" as const,
      }));
    }
    if (sp?.columns?.length) {
      const locked = sp.locked;
      return sp.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.sourceAgentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "system-prompt" as const,
      }));
    }
    if (tools?.columns?.length) {
      const locked = tools.locked;
      return tools.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.sourceAgentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "tools" as const,
      }));
    }
    if (rm?.columns?.length) {
      const locked = rm.locked;
      return rm.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: c.label,
        agentId: locked?.agentId ?? null,
        agentVersion: locked?.agentVersion ?? null,
        mode: "request-mod" as const,
      }));
    }
    if (open?.columns?.length) {
      return open.columns.map((c) => ({
        columnId: c.columnId,
        conversationId: c.conversationId,
        label: undefined,
        agentId: c.agentId ?? null,
        agentVersion: c.agentVersion ?? null,
        mode: "open" as const,
      }));
    }
    return EMPTY;
  },
);
