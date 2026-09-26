"use client";

/**
 * SettingsToolbar
 *
 * Mode-2 toolbar. Mirrors Mode-1's layout but the actions reflect the
 * locked-axis model:
 *   - Add variant       — adds a settings column under the locked agent
 *   - Runs              — shared runs comparison window (reusable)
 *   - Open / Save as    — comparison-set persistence (settings-mode aware)
 *   - Clear (dropdown)  — Clear responses (keep settings + locked input)
 *                       / Reset variants (drop overrides + responses)
 *                       / Clear all (also drop locked input)
 *   - Submit all        — broadcasts locked input + runs every variant
 *
 * The Master input + Run settings windows from Mode 1 don't fit here —
 * Settings mode is BUILT around per-column run settings (each column is
 * a settings variant) and the input is shared by design, not optional.
 */

import { useState } from "react";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { recordToast, toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import { BattleHeader } from "@/features/agent-comparison/shared/BattleHeader";
import { reportBattleSubmit } from "@/features/agent-comparison/shared/reportBattleSubmit";
import { useBlindShuffle } from "@/features/agent-comparison/shared/useBlindShuffle";
import { resetBlind } from "@/features/agent-comparison/redux/battleSlice";
import { PresetMenu } from "./PresetMenu";
import {
  setActiveSettingsSet,
  setSettingsColumnCollapsed,
  setSettingsColumns,
} from "../redux/slice";
import {
  addColumnToSettingsBattle,
  clearSettingsBattle,
  persistSettingsBattle,
  renameSettingsBattle,
  resetAllSettingsConversations,
  saveSettingsBattleAs,
  submitAllSettings,
} from "../redux/thunks";
import {
  selectActiveSettingsSetId,
  selectActiveSettingsSetName,
  selectCanSubmitSettings,
  selectCollapsedSettingsColumnCount,
  selectIsSubmittingAllSettings,
  selectLockedAgentId,
  selectSettingsColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function SettingsToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
}: Props) {
  const dispatch = useAppDispatch();

  const lockedAgentId = useAppSelector(selectLockedAgentId);
  const activeSetId = useAppSelector(selectActiveSettingsSetId);
  const activeSetName = useAppSelector(selectActiveSettingsSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllSettings);
  const canSubmit = useAppSelector(selectCanSubmitSettings);
  const columns = useAppSelector(selectSettingsColumns);
  const collapsedCount = useAppSelector(selectCollapsedSettingsColumnCount);
  const maybeShuffleForBlind = useBlindShuffle();

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetKeepInputsConfirm, setResetKeepInputsConfirm] = useState(false);

  const handleSubmitAll = async () => {
    if (!lockedAgentId) {
      toast.error("Pick an agent in the Locked input section first.");
      return;
    }
    if (columns.length === 0) {
      toast.error(
        "Add at least one variant. Click the 'Add variant' button to start.",
      );
      return;
    }
    try {
      maybeShuffleForBlind(columns, setSettingsColumns);
      reportBattleSubmit(await dispatch(submitAllSettings()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistSettingsBattle()).unwrap();
      recordToast.success(
        {
          type: "agent_comparison_battle",
          id: saved.id,
          title: saved.name,
        },
        saved.created ? "Battle saved" : "Changes saved",
      );
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleSaveAsConfirm = async (name: string) => {
    setSaveAsBusy(true);
    try {
      await dispatch(saveSettingsBattleAs({ name })).unwrap();
      setSaveAsOpen(false);
      toast.success(`Saved a copy as "${name}"`);
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaveAsBusy(false);
    }
  };

  const handleRenameConfirm = async (name: string) => {
    setRenameBusy(true);
    try {
      await dispatch(renameSettingsBattle({ name })).unwrap();
      setRenameOpen(false);
    } catch (err) {
      toast.error(
        `Couldn't rename: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const handleClear = async () => {
    setClearConfirm(false);
    try {
      await dispatch(clearSettingsBattle()).unwrap();
      dispatch(resetBlind());
    } catch (err) {
      toast.error(
        `Couldn't clear: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleResetConversations = async () => {
    setResetConfirm(false);
    try {
      await dispatch(
        resetAllSettingsConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Variants reset (overrides cleared)");
    } catch (err) {
      toast.error(
        `Couldn't reset: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleClearResponsesKeepInputs = async () => {
    setResetKeepInputsConfirm(false);
    try {
      await dispatch(
        resetAllSettingsConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · variants + locked input preserved");
    } catch (err) {
      toast.error(
        `Couldn't clear: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleExpandAll = () => {
    for (const col of columns) {
      if (col.collapsed) {
        dispatch(
          setSettingsColumnCollapsed({ columnId: col.columnId, collapsed: false }),
        );
      }
    }
  };

  const actions: HeaderAction[] = [
    {
      icon: "Activity",
      label: runsWindowOpen ? "Close runs comparison" : "Compare runs",
      onPress: onToggleRunsWindow,
    },
    {
      icon: "Library",
      label: "Open a saved battle",
      onPress: () => setLoaderOpen(true),
    },
    ...(lockedAgentId
      ? [
          {
            icon: "Plus",
            label: "Add variant",
            onPress: () => {
              void dispatch(addColumnToSettingsBattle(undefined));
            },
          },
        ]
      : []),
    ...(lockedAgentId && columns.length > 0
      ? [
          {
            icon: "Save",
            label: activeSetId ? "Save changes" : "Save battle",
            onPress: () => {
              void handleSave();
            },
          },
          ...(activeSetId
            ? [
                {
                  icon: "Pencil",
                  label: "Rename battle…",
                  onPress: () => setRenameOpen(true),
                },
                {
                  icon: "Copy",
                  label: "Save a copy…",
                  onPress: () => setSaveAsOpen(true),
                },
              ]
            : []),
          {
            icon: "RotateCcw",
            label: "Clear responses only",
            onPress: () => setResetKeepInputsConfirm(true),
          },
          {
            icon: "RotateCcw",
            label: "Reset variants",
            onPress: () => setResetConfirm(true),
          },
        ]
      : []),
    ...(collapsedCount > 0
      ? [
          {
            icon: "Expand",
            label: `Show ${collapsedCount} hidden variants`,
            onPress: handleExpandAll,
          },
        ]
      : []),
    ...(lockedAgentId || columns.length > 0
      ? [
          {
            icon: "SquarePlus",
            label: "Start a new battle",
            destructive: true,
            onPress: () => setClearConfirm(true),
          },
        ]
      : []),
  ];

  return (
    <>
      <BattleHeader
        battleName={activeSetName}
        fallbackTitle="Settings battle"
        actions={actions}
        extra={<PresetMenu />}
        onSubmit={() => {
          void handleSubmitAll();
        }}
        submitting={isSubmittingAll}
        canSubmit={canSubmit}
        submitTitle="Run the shared request against every variant"
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save a copy of this battle"
        description="The copy keeps the same agent, shared request and per-column settings, and opens as its own battle."
        placeholder="My settings comparison"
        confirmLabel="Save copy"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <TextInputDialog
        open={renameOpen}
        onOpenChange={(o) => !renameBusy && setRenameOpen(o)}
        title="Rename battle"
        placeholder="Battle name"
        defaultValue={activeSetName ?? ""}
        confirmLabel="Rename"
        busy={renameBusy}
        onConfirm={handleRenameConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        mode="settings"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveSettingsSet(null));
        }}
      />

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={(o) => {
          if (!o) setClearConfirm(false);
        }}
        title="Start a new battle?"
        description={
          activeSetId
            ? "Empties the page — variants, agent and shared request. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page — variants, agent and shared request. This battle was never saved; its conversations stay in your chat history."
        }
        confirmLabel="Start new"
        variant="destructive"
        onConfirm={handleClear}
      />

      <ConfirmDialog
        open={resetConfirm}
        onOpenChange={(o) => {
          if (!o) setResetConfirm(false);
        }}
        title="Reset all variants?"
        description="Drops every variant's per-column LLM overrides and streamed responses. The locked agent + variables + user message are preserved."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleResetConversations}
      />

      <ConfirmDialog
        open={resetKeepInputsConfirm}
        onOpenChange={(o) => {
          if (!o) setResetKeepInputsConfirm(false);
        }}
        title="Clear responses, keep everything else?"
        description="Discards streamed responses on every variant, but preserves the per-column overrides AND the locked input. Useful when you want to re-run the same configuration against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
