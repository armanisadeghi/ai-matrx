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

import { readModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { selectModelColumnTitle } from "../modes/model/columnTitle";
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
  /** A paused Variations column — Submit All leaves it out (`isSubmitAllTarget`). */
  paused?: boolean;
}

const EMPTY: BattleColumnDescriptor[] = [];

/**
 * Selector options for anything that reads the model catalog (not Redux state)
 * through its inputs: reselect would otherwise skip the inputs whenever the
 * Redux state is the same object, and a model list that just loaded would never
 * reach the names. The result function is still memoized on the inputs.
 */
export const readsCatalogOptions = { argsMemoize: <F extends (...a: never[]) => unknown>(fn: F) => fn } as const;

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
const selectMatrix = (s: RootState) => s.agentComparisonMatrix;
// A Model column is named after its model, read live (modes/model/columnTitle).
// The names come from the model catalog's records (a new records state re-runs this selector).
const selectModelRegistry = () => readModelRecords();
const selectModelOverrides = (s: RootState) => s.instanceModelOverrides;

interface LockedColumnSource {
  columns: { columnId: string; conversationId: string; label: string; paused?: boolean }[];
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
    ...(c.paused ? { paused: true } : {}),
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
    selectModelRegistry,
    selectModelOverrides,
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
    modelRegistry,
    modelOverrides,
  ): BattleColumnDescriptor[] => {
    switch (mounted) {
      case "settings":
        return lockedColumns(settings, settings.locked.agentId, settings.locked.agentVersion, "settings");
      case "model": {
        void modelRegistry;
        const naming = { instanceModelOverrides: modelOverrides } as unknown as RootState;
        // Two columns on the same model get "(2)", "(3)"… so a table or a
        // report can tell them apart.
        const seen = new Map<string, number>();
        return lockedColumns(
          {
            columns: model.columns.map((c) => {
              const title = selectModelColumnTitle(naming, c);
              const n = (seen.get(title) ?? 0) + 1;
              seen.set(title, n);
              return { ...c, label: n > 1 ? `${title} (${n})` : title };
            }),
          },
          model.locked.agentId,
          model.locked.agentVersion,
          "model",
        );
      }
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
  readsCatalogOptions,
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
    selectMatrix,
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
    matrix,
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
      case "matrix":
        return matrix.activeSetId;
      default:
        return null;
    }
  },
);

/** The saved battle's name for the mode on screen (null before its first save). */
export const selectMountedBattleName = createSelector(
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
    selectMatrix,
  ],
  (mounted, open, settings, model, tuning, sp, tools, rm, variations, conversation, matrix) => {
    switch (mounted) {
      case "open":
        return open.activeSetName;
      case "settings":
        return settings.activeSetName;
      case "model":
        return model.activeSetName;
      case "tuning":
        return tuning.activeSetName;
      case "system-prompt":
        return sp.activeSetName;
      case "tools":
        return tools.activeSetName;
      case "request-mod":
        return rm.activeSetName;
      case "variations":
        return variations.activeSetName;
      case "conversation":
        return conversation.activeSetName;
      case "matrix":
        return matrix.activeSetName;
      default:
        return null;
    }
  },
);

/**
 * Every conversation the battle page runs ITSELF: each column of the mode on
 * screen, and every locked-axis mode's shared composer (its request is copied
 * into each column on Submit All). These are the page's OWN conversations
 * (common-docs context-delivery RULES.md §0): they never receive the battle as
 * context, nor their route or their own id. A chat opened in a window over the
 * battle is not one of them and keeps the page.
 */
export function isBattleOwnConversation(state: RootState, conversationId: string): boolean {
  if (selectActiveBattleColumns(state).some((col) => col.conversationId === conversationId)) {
    return true;
  }
  return [
    state.agentComparisonSettings.inputConversationId,
    state.agentComparisonModel.inputConversationId,
    state.agentComparisonTuning.inputConversationId,
    state.agentComparisonSystemPrompt.inputConversationId,
    state.agentComparisonTools.inputConversationId,
    state.agentComparisonVariations.inputConversationId,
  ].includes(conversationId);
}
