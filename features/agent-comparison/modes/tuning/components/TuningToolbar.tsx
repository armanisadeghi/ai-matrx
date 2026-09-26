"use client";

/**
 * TuningToolbar — Mode-3 toolbar.
 *
 * Mirrors Mode-2's structure (Settings) since the locked-axis flow is
 * identical: add variants, submit all, persist as a comparison set.
 * Mode-3 has no preset menu yet — meaningful tuning presets are
 * a future iteration; presets here would either be too generic
 * ("verbose / terse") or domain-specific in a way that doesn't fit a
 * static list.
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
import { setActiveTuningSet, setTuningColumnCollapsed, setTuningColumns } from "../redux/slice";
import {
  addColumnToTuningBattle,
  clearTuningBattle,
  persistTuningBattle,
  renameTuningBattle,
  resetAllTuningConversations,
  saveTuningBattleAs,
  submitAllTuning,
} from "../redux/thunks";
import {
  selectActiveTuningSetId,
  selectActiveTuningSetName,
  selectCanSubmitTuning,
  selectCollapsedTuningColumnCount,
  selectIsSubmittingAllTuning,
  selectSourceAgentId,
  selectTuningColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function TuningToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
}: Props) {
  const dispatch = useAppDispatch();

  const sourceAgentId = useAppSelector(selectSourceAgentId);
  const activeSetId = useAppSelector(selectActiveTuningSetId);
  const activeSetName = useAppSelector(selectActiveTuningSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllTuning);
  const canSubmit = useAppSelector(selectCanSubmitTuning);
  const columns = useAppSelector(selectTuningColumns);
  const collapsedCount = useAppSelector(
    selectCollapsedTuningColumnCount,
  );
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
    if (!sourceAgentId) {
      toast.error("Pick a source agent in the Locked input section first.");
      return;
    }
    if (columns.length === 0) {
      toast.error(
        "Add at least one variant. Click the 'Add variant' button to start.",
      );
      return;
    }
    try {
      maybeShuffleForBlind(columns, setTuningColumns);
      reportBattleSubmit(await dispatch(submitAllTuning()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistTuningBattle()).unwrap();
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
      await dispatch(saveTuningBattleAs({ name })).unwrap();
      setSaveAsOpen(false);
      toast.success(`Saved a copy as "${name}"`);
    } catch (err) {
      toast.error(
        `Couldn't save: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setSaveAsBusy(false);
    }
  };

  const handleRenameConfirm = async (name: string) => {
    setRenameBusy(true);
    try {
      await dispatch(renameTuningBattle({ name })).unwrap();
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
      await dispatch(clearTuningBattle()).unwrap();
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
        resetAllTuningConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Variants reset (prompts reset to source baseline)");
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
        resetAllTuningConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success(
        "Responses cleared · per-column prompts + locked input preserved",
      );
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
          setTuningColumnCollapsed({
            columnId: col.columnId,
            collapsed: false,
          }),
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
    ...(sourceAgentId
      ? [
          {
            icon: "Plus",
            label: "Add variant",
            onPress: () => {
              void dispatch(addColumnToTuningBattle(undefined));
            },
          },
        ]
      : []),
    ...(sourceAgentId && columns.length > 0
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
    ...(sourceAgentId || columns.length > 0
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
        fallbackTitle="Tuning battle"
        actions={actions}
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
        description="The copy keeps the same source agent, locked input and per-column tuning, and opens as its own battle."
        placeholder="My tuning comparison"
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
        mode="tuning"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveTuningSet(null));
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
            ? "Empties the page — variants, source agent and locked input. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page — variants, source agent and locked input. This battle was never saved; its conversations stay in your chat history."
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
        description="Drops every variant's per-column tuning edits and streamed responses. The source agent + variables + user message are preserved; each variant is re-forked from the baseline."
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
        description="Discards streamed responses on every variant, but preserves the per-column model + settings tuning AND the locked input. Useful when you want to re-run the same configuration against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
