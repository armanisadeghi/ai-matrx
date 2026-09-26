"use client";

/**
 * BattleToolbar — Open mode's actions, drawn by the shared BattleHeader.
 *
 * Open mode is the only mode with a per-column agent, so it alone carries the
 * Master input, shared Context, Run settings and Decisions windows.
 */

import { useState } from "react";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { recordToast, toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  addBattleColumn,
  clearBattle,
  expandAllBattleColumns,
  persistBattle,
  renameActiveBattleSet,
  resetAllBattleConversations,
  saveBattleAs,
  submitAllBattleColumns,
} from "../redux/thunks";
import {
  selectActiveBattleSetId,
  selectActiveBattleSetName,
  selectBattleColumns,
  selectCollapsedBattleColumnCount,
  selectIsSubmittingAllBattle,
  selectSubmittableBattleColumns,
} from "../redux/selectors";
import { ComparisonSetLoaderDialog } from "./ComparisonSetLoaderDialog";
import { BattleHeader } from "../shared/BattleHeader";
import { reportBattleSubmit } from "../shared/reportBattleSubmit";
import { useBlindShuffle } from "../shared/useBlindShuffle";
import { resetBlind, setActiveSet, setColumns } from "../redux/battleSlice";

interface BattleToolbarProps {
  contextWindowOpen: boolean;
  onToggleContextWindow: () => void;
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
  decisionsWindowOpen?: boolean;
  onToggleDecisionsWindow?: () => void;
  runSettingsWindowOpen: boolean;
  onToggleRunSettingsWindow: () => void;
  masterInputWindowOpen: boolean;
  onToggleMasterInputWindow: () => void;
}

export function BattleToolbar({
  contextWindowOpen,
  onToggleContextWindow,
  runsWindowOpen,
  onToggleRunsWindow,
  decisionsWindowOpen = false,
  onToggleDecisionsWindow,
  runSettingsWindowOpen,
  onToggleRunSettingsWindow,
  masterInputWindowOpen,
  onToggleMasterInputWindow,
}: BattleToolbarProps) {
  const dispatch = useAppDispatch();

  const activeSetId = useAppSelector(selectActiveBattleSetId);
  const activeSetName = useAppSelector(selectActiveBattleSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllBattle);
  const columns = useAppSelector(selectBattleColumns);
  const submittable = useAppSelector(selectSubmittableBattleColumns);
  const collapsedCount = useAppSelector(selectCollapsedBattleColumnCount);
  const maybeShuffleForBlind = useBlindShuffle();

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetKeepInputsConfirm, setResetKeepInputsConfirm] = useState(false);

  const runSubmit = async () => {
    // Blind test: shuffle + activate masking before firing the run.
    maybeShuffleForBlind(columns, setColumns);
    try {
      reportBattleSubmit(await dispatch(submitAllBattleColumns()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSubmitAll = () => {
    if (submittable.length === 0) {
      toast.info("Pick an agent in at least one column before submitting.");
      return;
    }
    void runSubmit();
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistBattle()).unwrap();
      recordToast.success(
        {
          type: "agent_comparison_battle",
          id: saved.id,
          title: saved.name,
        },
        saved.created ? "Battle saved" : "Changes saved",
      );
    } catch (err) {
      toast.error(
        `Couldn't save: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSaveAsConfirm = async (name: string) => {
    setSaveAsBusy(true);
    try {
      await dispatch(saveBattleAs({ name })).unwrap();
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
      await dispatch(renameActiveBattleSet({ name })).unwrap();
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
      await dispatch(clearBattle()).unwrap();
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
      await dispatch(resetAllBattleConversations(undefined)).unwrap();
      toast.success("Conversations reset");
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
        resetAllBattleConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · inputs preserved");
    } catch (err) {
      toast.error(
        `Couldn't clear: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const actions: HeaderAction[] = [
    {
      icon: "Plus",
      label: "Add agent",
      onPress: () => {
        void dispatch(addBattleColumn());
      },
    },
    {
      icon: "Zap",
      label: masterInputWindowOpen ? "Close master input" : "Master input",
      onPress: onToggleMasterInputWindow,
    },
    {
      icon: "Layers",
      label: contextWindowOpen ? "Close shared context" : "Shared context",
      onPress: onToggleContextWindow,
    },
    {
      icon: "SlidersHorizontal",
      label: runSettingsWindowOpen ? "Close run settings" : "Run settings",
      onPress: onToggleRunSettingsWindow,
    },
    {
      icon: "Activity",
      label: runsWindowOpen ? "Close runs comparison" : "Compare runs",
      onPress: onToggleRunsWindow,
    },
    ...(onToggleDecisionsWindow
      ? [
          {
            icon: "Scale",
            label: decisionsWindowOpen ? "Close decisions" : "Compare decisions",
            onPress: onToggleDecisionsWindow,
          },
        ]
      : []),
    {
      icon: "Library",
      label: "Open a saved battle",
      onPress: () => setLoaderOpen(true),
    },
    ...(submittable.length > 0
      ? [
          {
            icon: "Save",
            label: activeSetId ? "Save changes" : "Save battle",
            onPress: () => {
              void handleSave();
            },
          },
        ]
      : []),
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
    ...(columns.length > 0
      ? [
          {
            icon: "RotateCcw",
            label: "Clear responses only",
            onPress: () => setResetKeepInputsConfirm(true),
          },
          {
            icon: "RotateCcw",
            label: "Reset conversations",
            onPress: () => setResetConfirm(true),
          },
        ]
      : []),
    ...(collapsedCount > 0
      ? [
          {
            icon: "Expand",
            label: `Show ${collapsedCount} hidden columns`,
            onPress: () => {
              void dispatch(expandAllBattleColumns());
            },
          },
        ]
      : []),
    ...(columns.length > 0
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
        fallbackTitle="Open battle"
        actions={actions}
        inlineCount={2}
        onSubmit={handleSubmitAll}
        submitting={isSubmittingAll}
        canSubmit={submittable.length > 0}
        submitTitle="Run every column that has an agent"
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save a copy of this battle"
        description="The copy keeps the same agents and columns, and opens as its own battle. The conversations are shared with the original."
        placeholder="My comparison"
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
        mode="open"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveSet(null));
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
            ? "Empties the page. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page. This battle was never saved; its conversations stay in your chat history."
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
        title="Reset all conversations?"
        description="Discards every column's typed inputs and streamed responses, and starts a fresh conversation for each agent. The agent + version selections stay in place. The previous conversations remain in your chat history."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleResetConversations}
      />

      <ConfirmDialog
        open={resetKeepInputsConfirm}
        onOpenChange={(o) => {
          if (!o) setResetKeepInputsConfirm(false);
        }}
        title="Clear responses, keep inputs?"
        description="Discards every column's streamed responses + context entries, but restores the current user message and variable values into a fresh conversation. Useful when you want to re-run the same setup against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
