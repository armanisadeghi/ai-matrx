"use client";

/**
 * VariationsToolbar — the Variations-mode toolbar.
 *
 * Mirrors the other locked-axis toolbars (add variant, submit all, persist as
 * a comparison set) and adds the "Edit" toggle for the floating editor window
 * where the per-variation full builder lives.
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
  setActiveVariationsSet,
  setVariationColumnCollapsed,
  setVariationColumns,
} from "../redux/slice";
import {
  addColumnToVariationsBattle,
  clearVariationsBattle,
  persistVariationsBattle,
  renameVariationsBattle,
  resetAllVariationsConversations,
  saveVariationsBattleAs,
  submitAllVariations,
} from "../redux/thunks";
import {
  selectActiveVariationsSetId,
  selectActiveVariationsSetName,
  selectCanSubmitVariations,
  selectCollapsedVariationColumnCount,
  selectIsSubmittingAllVariations,
  selectSourceAgentId,
  selectVariationColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
  editorOpen: boolean;
  onToggleEditor: () => void;
}

export function VariationsToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
  editorOpen,
  onToggleEditor,
}: Props) {
  const dispatch = useAppDispatch();

  const sourceAgentId = useAppSelector(selectSourceAgentId);
  const activeSetId = useAppSelector(selectActiveVariationsSetId);
  const activeSetName = useAppSelector(selectActiveVariationsSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllVariations);
  const canSubmit = useAppSelector(selectCanSubmitVariations);
  const columns = useAppSelector(selectVariationColumns);
  const collapsedCount = useAppSelector(selectCollapsedVariationColumnCount);
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
      toast.error("Pick a template agent in the Template section first.");
      return;
    }
    if (columns.length === 0) {
      toast.error("Add at least one variation before submitting.");
      return;
    }
    try {
      maybeShuffleForBlind(columns, setVariationColumns);
      reportBattleSubmit(await dispatch(submitAllVariations()).unwrap());
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistVariationsBattle()).unwrap();
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
      await dispatch(saveVariationsBattleAs({ name })).unwrap();
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
      await dispatch(renameVariationsBattle({ name })).unwrap();
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
      await dispatch(clearVariationsBattle()).unwrap();
      dispatch(resetBlind());
    } catch (err) {
      toast.error(`Couldn't clear: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleResetConversations = async () => {
    setResetConfirm(false);
    try {
      await dispatch(
        resetAllVariationsConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Variations reset to the template baseline");
    } catch (err) {
      toast.error(`Couldn't reset: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleClearResponsesKeepInputs = async () => {
    setResetKeepInputsConfirm(false);
    try {
      await dispatch(
        resetAllVariationsConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · per-variation edits preserved");
    } catch (err) {
      toast.error(`Couldn't clear: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleExpandAll = () => {
    for (const col of columns) {
      if (col.collapsed) {
        dispatch(
          setVariationColumnCollapsed({
            columnId: col.columnId,
            collapsed: false,
          }),
        );
      }
    }
  };

  const actions: HeaderAction[] = [
    // The per-variation editor is this mode's main tool; keep it visible.
    ...(columns.length > 0
      ? [
          {
            icon: "Pencil",
            label: editorOpen ? "Close variation editor" : "Edit variations",
            onPress: onToggleEditor,
          },
        ]
      : []),
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
            label: "Add variation",
            onPress: () => {
              void dispatch(addColumnToVariationsBattle(undefined));
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
            label: "Reset variations",
            onPress: () => setResetConfirm(true),
          },
        ]
      : []),
    ...(collapsedCount > 0
      ? [
          {
            icon: "Expand",
            label: `Show ${collapsedCount} hidden variations`,
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
        fallbackTitle="Variations battle"
        actions={actions}
        inlineCount={columns.length > 0 ? 2 : 1}
        onSubmit={() => {
          void handleSubmitAll();
        }}
        submitting={isSubmittingAll}
        canSubmit={canSubmit}
        submitTitle="Run the shared request against every variation that is not paused"
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save a copy of this battle"
        description="The copy keeps the same template, test input and per-variation edits, and opens as its own battle. No agents are created."
        placeholder="My variations comparison"
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
        mode="variations"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveVariationsSet(null));
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
            ? "Empties the page — variations, template and test input. This battle stays saved; reopen it from Open a saved battle. Its conversations stay in your chat history."
            : "Empties the page — variations, template and test input. This battle was never saved; its conversations stay in your chat history."
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
        title="Reset all variations?"
        description="Drops every variation's edits and streamed responses. The template + test input are preserved; each variation is re-forked from the template baseline."
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
        description="Discards streamed responses on every variation, but preserves the per-variation edits AND the template input. Useful to re-run the same configuration against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
