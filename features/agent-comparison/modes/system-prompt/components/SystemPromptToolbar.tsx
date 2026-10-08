"use client";

/**
 * SystemPromptToolbar — Mode-3 toolbar.
 *
 * Mirrors Mode-2's structure (Settings) since the locked-axis flow is
 * identical: add variants, submit all, persist as a comparison set.
 * Mode-3 has no preset menu yet — meaningful system-prompt presets are
 * a future iteration; presets here would either be too generic
 * ("verbose / terse") or domain-specific in a way that doesn't fit a
 * static list.
 */

import { useState } from "react";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { recordToast, toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@ai-matrx/design-system";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import { BattleHeader } from "@/features/agent-comparison/shared/BattleHeader";
import { reportBattleSubmit } from "@/features/agent-comparison/shared/reportBattleSubmit";
import { useBlindShuffle } from "@/features/agent-comparison/shared/useBlindShuffle";
import { resetBlind } from "@/features/agent-comparison/redux/battleSlice";
import {
  setActiveSystemPromptSet,
  setSystemPromptColumnCollapsed,
  setSystemPromptColumns,
} from "../redux/slice";
import {
  addColumnToSystemPromptBattle,
  clearSystemPromptBattle,
  persistSystemPromptBattle,
  renameSystemPromptBattle,
  resetAllSystemPromptConversations,
  saveSystemPromptBattleAs,
  submitAllSystemPrompt,
} from "../redux/thunks";
import {
  selectActiveSystemPromptSetId,
  selectActiveSystemPromptSetName,
  selectCanSubmitSystemPrompt,
  selectCollapsedSystemPromptColumnCount,
  selectIsSubmittingAllSystemPrompt,
  selectSourceAgentId,
  selectSystemPromptColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function SystemPromptToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
}: Props) {
  const dispatch = useAppDispatch();

  const sourceAgentId = useAppSelector(selectSourceAgentId);
  const activeSetId = useAppSelector(selectActiveSystemPromptSetId);
  const activeSetName = useAppSelector(selectActiveSystemPromptSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllSystemPrompt);
  const canSubmit = useAppSelector(selectCanSubmitSystemPrompt);
  const columns = useAppSelector(selectSystemPromptColumns);
  const collapsedCount = useAppSelector(
    selectCollapsedSystemPromptColumnCount,
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
    if (!canSubmit) {
      toast.error(
        "Type the shared request first, or pick an agent whose variables fill the prompt on their own.",
      );
      return;
    }
    try {
      maybeShuffleForBlind(columns, setSystemPromptColumns);
      reportBattleSubmit(await dispatch(submitAllSystemPrompt()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistSystemPromptBattle()).unwrap();
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
      await dispatch(saveSystemPromptBattleAs({ name })).unwrap();
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
      await dispatch(renameSystemPromptBattle({ name })).unwrap();
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
      await dispatch(clearSystemPromptBattle()).unwrap();
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
        resetAllSystemPromptConversations({ preserveInputs: false }),
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
        resetAllSystemPromptConversations({ preserveInputs: true }),
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
          setSystemPromptColumnCollapsed({
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
              void dispatch(addColumnToSystemPromptBattle(undefined));
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
            icon: "Eraser",
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
        fallbackTitle="System prompt battle"
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
        description="The copy keeps the same source agent, shared request and per-column system prompts, and opens as its own battle."
        placeholder="My system-prompt comparison"
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
        mode="system-prompt"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveSystemPromptSet(null));
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
            ? "Empties the page — variants, source agent and shared request. This battle stays in Open a saved battle; its chats stay in history."
            : "Empties the page — variants, source agent and shared request. This battle was never saved; its chats stay in history."
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
        description="Drops each variant's system-prompt edits and responses, re-forking it from the baseline. The source agent, variables and message stay."
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
        description="Clears responses on every variant; system prompts and the locked input stay."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
