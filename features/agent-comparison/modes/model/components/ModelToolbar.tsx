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
import { Loader2, Play } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { BattleModeNav } from "@/features/agent-comparison/shared/ModePicker";
import { recordToast, toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import { useBlindShuffle } from "@/features/agent-comparison/shared/useBlindShuffle";
import { resetBlind } from "@/features/agent-comparison/redux/battleSlice";
import { selectBlindActive } from "@/features/agent-comparison/redux/selectors";
import { setModelColumnCollapsed, setModelColumns } from "../redux/slice";
import {
  addColumnToModelBattle,
  clearModelBattle,
  loadModelBattleSet,
  resetAllModelConversations,
  saveModelBattle,
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
      toast.error(
        "Add at least one model variant. Click 'Add model' to start.",
      );
      return;
    }
    // Blind test: shuffle + activate masking BEFORE firing the run.
    maybeShuffleForBlind(columns, setModelColumns);
    try {
      const res = await dispatch(submitAllModel()).unwrap();
      const parts: string[] = [];
      if (res.launched > 0) parts.push(`${res.launched} launched`);
      if (res.skipped > 0) parts.push(`${res.skipped} skipped`);
      if (res.failed > 0) parts.push(`${res.failed} failed`);
      if (res.failed > 0) {
        toast.error(parts.join(" · "));
      } else {
        toast.success(parts.join(" · ") || "Done");
      }
    } catch (err) {
      toast.error(
        `Submit all failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  const handleSave = async () => {
    if (!activeSetId) {
      setSaveAsOpen(true);
      return;
    }
    try {
      await dispatch(saveModelBattle()).unwrap();
      recordToast.success(
        {
          type: "agent_comparison_battle",
          id: activeSetId,
          title: blindActive ? "Model comparison" : activeSetName,
        },
        blindActive ? "Comparison saved" : `Saved "${activeSetName}"`,
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
      toast.success(blindActive ? "Comparison saved" : `Saved as "${name}"`);
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaveAsBusy(false);
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
      toast.success("Variants reset (model overrides cleared)");
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
      toast.success(
        "Responses cleared · per-column models + locked input preserved",
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
      icon: "Library",
      label: "Open comparison",
      onPress: () => setLoaderOpen(true),
    },
    {
      icon: "Activity",
      label: runsWindowOpen ? "Close runs" : "Compare runs",
      onPress: onToggleRunsWindow,
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
            label: activeSetId ? "Save comparison" : "Save comparison as…",
            onPress: () => {
              void handleSave();
            },
          },
          ...(activeSetId
            ? [
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
            label: "Reset model variants",
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
            icon: "Eraser",
            label: "Clear comparison",
            destructive: true,
            onPress: () => setClearConfirm(true),
          },
        ]
      : []),
  ];

  return (
    <>
      <RouteHeader
        center={<BattleModeNav />}
        right={
          <div className="flex items-center">
            <HeaderActions
              actions={actions}
              maxInline={1}
              sheetTitle={
                blindActive
                  ? "Model comparison"
                  : (activeSetName ?? "Model comparison")
              }
            />
            <Button
              size="sm"
              onClick={handleSubmitAll}
              disabled={isSubmittingAll || !canSubmit}
              aria-label="Submit all models"
              title="Run the shared request against every model"
              className="h-8 max-sm:h-11 max-sm:w-11 max-sm:p-0 shrink-0"
            >
              {isSubmittingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span className="max-sm:sr-only">Submit all</span>
            </Button>
          </div>
        }
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save model comparison"
        description="Give this comparison a name. The locked agent + variables + user message are saved as part of the set; per-column model picks are saved per entry."
        placeholder="My model comparison"
        confirmLabel="Save"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        modeFilter="model"
        loadFn={async (setId) => {
          await dispatch(loadModelBattleSet({ setId })).unwrap();
        }}
      />

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={(o) => {
          if (!o) setClearConfirm(false);
        }}
        title="Clear all?"
        description="Empties the page entirely — variants, locked agent, locked inputs. Conversations remain in your chat history."
        confirmLabel="Clear"
        variant="destructive"
        onConfirm={handleClear}
      />

      <ConfirmDialog
        open={resetConfirm}
        onOpenChange={(o) => {
          if (!o) setResetConfirm(false);
        }}
        title="Reset all variants?"
        description="Drops every variant's per-column model pick and streamed responses. The locked agent + variables + user message are preserved."
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
        description="Discards streamed responses on every variant, but preserves the per-column model picks AND the locked input."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
