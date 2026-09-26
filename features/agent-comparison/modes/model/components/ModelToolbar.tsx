"use client";

/**
 * ModelToolbar — Mode-6 toolbar (Model).
 *
 * Same locked-axis structure as Settings — add variants, submit all,
 * persist as a comparison set. No PresetMenu — the model picker is
 * inline in each column header and presets at this level wouldn't add
 * much.
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
import { selectBlindActive } from "@/features/agent-comparison/redux/selectors";
import {
  setActiveModelSet,
  setModelColumnCollapsed,
  setModelColumns,
} from "../redux/slice";
import {
  addColumnToModelBattle,
  clearModelBattle,
  persistModelBattle,
  renameModelBattle,
  resetAllModelConversations,
  saveModelBattleAs,
  submitAllModel,
} from "../redux/thunks";
import {
  selectActiveModelSetId,
  selectActiveModelSetName,
  selectCanSubmitModel,
  selectCollapsedModelColumnCount,
  selectIsSubmittingAllModel,
  selectLockedAgentId,
  selectModelColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function ModelToolbar({ runsWindowOpen, onToggleRunsWindow }: Props) {
  const dispatch = useAppDispatch();

  const lockedAgentId = useAppSelector(selectLockedAgentId);
  const activeSetId = useAppSelector(selectActiveModelSetId);
  const activeSetName = useAppSelector(selectActiveModelSetName);
  const blindActive = useAppSelector(selectBlindActive);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllModel);
  const canSubmit = useAppSelector(selectCanSubmitModel);
  const columns = useAppSelector(selectModelColumns);
  const collapsedCount = useAppSelector(selectCollapsedModelColumnCount);
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
      toast.error("Choose an agent in the shared request first.");
      return;
    }
    if (columns.length === 0) {
      toast.error("Add at least one model. Use Add model to start.");
      return;
    }
    // Blind test: shuffle + activate masking BEFORE firing the run.
    maybeShuffleForBlind(columns, setModelColumns);
    try {
      reportBattleSubmit(await dispatch(submitAllModel()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistModelBattle()).unwrap();
      recordToast.success(
        {
          type: "agent_comparison_battle",
          id: saved.id,
          title: blindActive ? "Model comparison" : saved.name,
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
      await dispatch(saveModelBattleAs({ name })).unwrap();
      setSaveAsOpen(false);
      toast.success(blindActive ? "Copy saved" : `Saved a copy as "${name}"`);
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaveAsBusy(false);
    }
  };

  const handleRenameConfirm = async (name: string) => {
    setRenameBusy(true);
    try {
      await dispatch(renameModelBattle({ name })).unwrap();
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
      await dispatch(clearModelBattle()).unwrap();
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
        resetAllModelConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Models reset (model picks cleared)");
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
        resetAllModelConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · model picks + shared request kept");
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
          setModelColumnCollapsed({
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
    ...(lockedAgentId
      ? [
          {
            icon: "Plus",
            label: "Add model",
            onPress: () => {
              void dispatch(addColumnToModelBattle(undefined));
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
            label: "Reset models",
            onPress: () => setResetConfirm(true),
          },
        ]
      : []),
    ...(collapsedCount > 0
      ? [
          {
            icon: "Expand",
            label: `Show ${collapsedCount} hidden models`,
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
        fallbackTitle="Model battle"
        actions={actions}
        onSubmit={() => {
          void handleSubmitAll();
        }}
        submitting={isSubmittingAll}
        canSubmit={canSubmit}
        submitTitle="Run the shared request against every model"
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save a copy of this battle"
        description="The copy keeps the same agent, shared request and model picks, and opens as its own battle."
        placeholder="My model comparison"
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
        mode="model"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveModelSet(null));
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
            ? "Empties the page — models, agent and shared request. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page — models, agent and shared request. This battle was never saved; its conversations stay in your chat history."
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
        title="Reset all models?"
        description="Drops every column's model pick and streamed responses. The agent, variables and shared request are kept."
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
        description="Discards streamed responses in every column, but keeps each column's model pick and the shared request."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
