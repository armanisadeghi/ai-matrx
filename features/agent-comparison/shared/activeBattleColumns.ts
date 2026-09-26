/**
 * activeBattleColumns
 *
 * Cross-mode column resolver for the shared surfaces (ResponseFeedbackBar,
 * RunsComparisonTable, SharedRunsWindow, DecisionComparisonTable).
 *
 * Every mode owns its own slice, and every slice stays alive across
 * navigation. The resolver therefore reads `agentComparison.mountedMode` —
 * the mode whose page is on screen, set by that page — and returns THAT
 * mode's columns. It used to return "the first slice with columns in a
 * priority order", so after using Settings, the Model page's runs table and
 * rating bars showed Settings' columns; and Variations was missing from the
 * order entirely, so its runs table showed another mode's columns or none.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { BattleModeId } from "./battleRoutes";

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
  mode: BattleModeId;
}

const EMPTY: BattleColumnDescriptor[] = [];

const selectMountedMode = (s: RootState) => s.agentComparison.mountedMode;
const selectOpen = (s: RootState) => s.agentComparison;
const selectSettings = (s: RootState) => s.agentComparisonSettings;
const selectModel = (s: RootState) => s.agentComparisonModel;
const selectTuning = (s: RootState) => s.agentComparisonTuning;
const selectSystemPrompt = (s: RootState) => s.agentComparisonSystemPrompt;
const selectTools = (s: RootState) => s.agentComparisonTools;
const selectRequestMod = (s: RootState) => s.agentComparisonRequestMod;
const selectVariations = (s: RootState) => s.agentComparisonVariations;
const selectConversation = (s: RootState) => s.agentComparisonConversation;

interface LockedColumnSource {
  columns: { columnId: string; conversationId: string; label: string }[];
}

function lockedColumns(
  source: LockedColumnSource,
  agentId: string | null,
  agentVersion: "current" | number | null,
  mode: BattleModeId,
): BattleColumnDescriptor[] {
  if (source.columns.length === 0) return EMPTY;
  return source.columns.map((c) => ({
    columnId: c.columnId,
    conversationId: c.conversationId,
    label: c.label,
    agentId,
    agentVersion,
    mode,
  }));
}

export const selectActiveBattleColumns = createSelector(
  [
    selectMountedMode,
    selectOpen,
    selectSettings,
    selectModel,
    selectTuning,
    selectSystemPrompt,
    selectTools,
    selectRequestMod,
    selectVariations,
    selectConversation,
  ],
  (
    mounted,
    open,
    settings,
    model,
    tuning,
    sp,
    tools,
    rm,
    variations,
    conversation,
  ): BattleColumnDescriptor[] => {
    switch (mounted) {
      case "settings":
        return lockedColumns(settings, settings.locked.agentId, settings.locked.agentVersion, "settings");
      case "model":
        return lockedColumns(model, model.locked.agentId, model.locked.agentVersion, "model");
      case "tuning":
        return lockedColumns(tuning, tuning.locked.sourceAgentId, tuning.locked.agentVersion, "tuning");
      case "system-prompt":
        return lockedColumns(sp, sp.locked.sourceAgentId, sp.locked.agentVersion, "system-prompt");
      case "tools":
        return lockedColumns(tools, tools.locked.sourceAgentId, tools.locked.agentVersion, "tools");
      case "request-mod":
        return lockedColumns(rm, rm.locked.agentId, rm.locked.agentVersion, "request-mod");
      case "variations":
        return lockedColumns(variations, variations.locked.sourceAgentId, variations.locked.agentVersion, "variations");
      case "conversation":
        // Every fork continues the same conversation, so it answers with the
        // source's agent (the rank picker only counts columns naming one).
        return lockedColumns(
          { columns: conversation.forks },
          conversation.source?.agentId ?? null,
          null,
          "conversation",
        );
      case "open":
        if (open.columns.length === 0) return EMPTY;
        return open.columns.map((c) => ({
          columnId: c.columnId,
          conversationId: c.conversationId,
          label: undefined,
          agentId: c.agentId ?? null,
          agentVersion: c.agentVersion ?? null,
          mode: "open" as const,
        }));
      default:
        return EMPTY;
    }
  },
);

/**
 * The saved battle of the mode on screen. Ratings are filed under it and read
 * back by it, so it must be the mounted mode's — it used to be Open mode's id
 * on every page, which filed every other mode's ratings under the wrong
 * battle (or none) and read them back empty.
 */
export const selectMountedBattleSetId = createSelector(
  [
    selectMountedMode,
    selectOpen,
    selectSettings,
    selectModel,
    selectTuning,
    selectSystemPrompt,
    selectTools,
    selectRequestMod,
    selectVariations,
    selectConversation,
  ],
  (
    mounted,
    open,
    settings,
    model,
    tuning,
    sp,
    tools,
    rm,
    variations,
    conversation,
  ) => {
    switch (mounted) {
      case "open":
        return open.activeSetId;
      case "settings":
        return settings.activeSetId;
      case "model":
        return model.activeSetId;
      case "tuning":
        return tuning.activeSetId;
      case "system-prompt":
        return sp.activeSetId;
      case "tools":
        return tools.activeSetId;
      case "request-mod":
        return rm.activeSetId;
      case "variations":
        return variations.activeSetId;
      case "conversation":
        return conversation.activeSetId;
      default:
        return null;
    }
  },
);
