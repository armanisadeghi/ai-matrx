"use client";

/**
 * RequestModToolbar — Mode-5 toolbar.
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
import {
  setActiveRequestModSet,
  setRequestModColumnCollapsed,
  setRequestModColumns,
} from "../redux/slice";
import {
  addColumnToRequestModBattle,
  clearRequestModBattle,
  persistRequestModBattle,
  renameRequestModBattle,
  resetAllRequestModConversations,
  saveRequestModBattleAs,
  submitAllRequestMod,
} from "../redux/thunks";
import {
  selectActiveRequestModSetId,
  selectActiveRequestModSetName,
  selectCanSubmitRequestMod,
  selectCollapsedRequestModColumnCount,
  selectIsSubmittingAllRequestMod,
  selectLockedAgentId,
  selectRequestModColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function RequestModToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
}: Props) {
  const dispatch = useAppDispatch();

  const agentId = useAppSelector(selectLockedAgentId);
  const activeSetId = useAppSelector(selectActiveRequestModSetId);
  const activeSetName = useAppSelector(selectActiveRequestModSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllRequestMod);
  const canSubmit = useAppSelector(selectCanSubmitRequestMod);
  const columns = useAppSelector(selectRequestModColumns);
  const collapsedCount = useAppSelector(
    selectCollapsedRequestModColumnCount,
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
    if (!agentId) {
      toast.error("Pick an agent in the Locked agent section first.");
      return;
    }
    if (columns.length === 0) {
      toast.error("Add at least one request column first.");
      return;
    }
    try {
      maybeShuffleForBlind(columns, setRequestModColumns);
      reportBattleSubmit(await dispatch(submitAllRequestMod()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistRequestModBattle()).unwrap();
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
      await dispatch(saveRequestModBattleAs({ name })).unwrap();
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
      await dispatch(renameRequestModBattle({ name })).unwrap();
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
      await dispatch(clearRequestModBattle()).unwrap();
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
        resetAllRequestModConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Requests reset (inputs cleared)");
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
        resetAllRequestModConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · per-column inputs preserved");
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
          setRequestModColumnCollapsed({
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
    ...(agentId
      ? [
          {
            icon: "Plus",
            label: "Add request",
            onPress: () => {
              void dispatch(addColumnToRequestModBattle(undefined));
            },
          },
        ]
      : []),
    ...(agentId && columns.length > 0
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
            label: "Reset requests",
            onPress: () => setResetConfirm(true),
          },
        ]
      : []),
    ...(collapsedCount > 0
      ? [
          {
            icon: "Expand",
            label: `Show ${collapsedCount} hidden columns`,
            onPress: handleExpandAll,
          },
        ]
      : []),
    ...(agentId || columns.length > 0
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
        fallbackTitle="Request mod battle"
        actions={actions}
        onSubmit={() => {
          void handleSubmitAll();
        }}
        submitting={isSubmittingAll}
        canSubmit={canSubmit}
        submitTitle="Run every column's own request"
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save a copy of this battle"
        description="The copy keeps the same locked agent and per-column inputs, and opens as its own battle."
        placeholder="My request comparison"
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
        mode="request-mod"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveRequestModSet(null));
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
            ? "Empties the page — columns, locked agent. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page — columns, locked agent. This battle was never saved; its conversations stay in your chat history."
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
        title="Reset all columns?"
        description="Drops every column's per-column inputs and streamed responses. The locked agent is preserved."
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
        description="Discards streamed responses on every column, but preserves the per-column inputs. Useful when you want to re-run the same requests against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
