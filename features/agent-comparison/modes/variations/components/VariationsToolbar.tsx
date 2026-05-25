"use client";

/**
 * VariationsToolbar — the Variations-mode toolbar.
 *
 * Mirrors the other locked-axis toolbars (add variant, submit all, persist as
 * a comparison set) and adds the "Edit" toggle for the floating editor window
 * where the per-variation full builder lives.
 */

import { useState } from "react";
import {
  Activity,
  ChevronDown,
  Eraser,
  EyeOff,
  Library,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import { BlindControls } from "@/features/agent-comparison/shared/BlindControls";
import { useBlindShuffle } from "@/features/agent-comparison/shared/useBlindShuffle";
import { resetBlind } from "@/features/agent-comparison/redux/battleSlice";
import {
  setVariationColumnCollapsed,
  setVariationColumns,
} from "../redux/slice";
import {
  addColumnToVariationsBattle,
  clearVariationsBattle,
  loadVariationsBattleSet,
  resetAllVariationsConversations,
  saveVariationsBattle,
  saveVariationsBattleAs,
  submitAllVariations,
} from "../redux/thunks";
import {
  selectActiveVariationsSetId,
  selectActiveVariationsSetName,
  selectCanSubmitVariations,
  selectCollapsedVariationColumnCount,
  selectIsSubmittingAllVariations,
  selectLockedSetup,
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
  const lockedSetup = useAppSelector(selectLockedSetup);
  const activeSetId = useAppSelector(selectActiveVariationsSetId);
  const activeSetName = useAppSelector(selectActiveVariationsSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllVariations);
  const canSubmit = useAppSelector(selectCanSubmitVariations);
  const columns = useAppSelector(selectVariationColumns);
  const collapsedCount = useAppSelector(selectCollapsedVariationColumnCount);
  const maybeShuffleForBlind = useBlindShuffle();

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
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
    if (!lockedSetup.userMessage.trim()) {
      const hasVars = Object.values(lockedSetup.variables).some((v) => {
        if (v == null) return false;
        if (typeof v === "string") return v.trim().length > 0;
        return true;
      });
      if (!hasVars) {
        toast.error("Add a test message before submitting.");
        return;
      }
    }
    try {
      maybeShuffleForBlind(columns, setVariationColumns);
      const res = await dispatch(submitAllVariations()).unwrap();
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
      await dispatch(saveVariationsBattle()).unwrap();
      toast.success(`Saved "${activeSetName}"`);
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    }
  };

  const handleSaveAsConfirm = async (name: string) => {
    setSaveAsBusy(true);
    try {
      await dispatch(saveVariationsBattleAs({ name })).unwrap();
      setSaveAsOpen(false);
      toast.success(`Saved as "${name}"`);
    } catch (err) {
      toast.error(`Couldn't save: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaveAsBusy(false);
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

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Variations
          </span>
          {activeSetName && (
            <span className="text-xs text-foreground truncate max-w-[200px]">
              · {activeSetName}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/70 shrink-0">
            ({columns.length} variation{columns.length === 1 ? "" : "s"})
          </span>
          {collapsedCount > 0 && (
            <button
              type="button"
              onClick={handleExpandAll}
              title={`Click to expand all ${collapsedCount} collapsed variation${
                collapsedCount === 1 ? "" : "s"
              }`}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[10px] font-semibold uppercase tracking-wider hover:bg-amber-500/25 transition-colors shrink-0"
            >
              <EyeOff className="w-3 h-3" />
              {collapsedCount} hidden
              <span className="text-[9px] font-normal opacity-70 ml-0.5">
                · click to show
              </span>
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant="default"
          onClick={() => dispatch(addColumnToVariationsBattle(undefined))}
          className="h-7 ml-1"
          disabled={!sourceAgentId}
          title={
            sourceAgentId
              ? "Add a new variation"
              : "Pick a template agent first"
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Add variation
        </Button>

        <Button
          size="sm"
          variant={editorOpen ? "default" : "outline"}
          onClick={onToggleEditor}
          className="h-7"
          disabled={columns.length === 0}
          title="Open the editor window to modify each variation"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Edit
        </Button>

        <div className="flex-1" />

        <Button
          size="sm"
          variant={runsWindowOpen ? "default" : "outline"}
          onClick={onToggleRunsWindow}
          className="h-7"
        >
          <Activity className="w-3.5 h-3.5" />
          Runs
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => setLoaderOpen(true)}
          className="h-7"
        >
          <Library className="w-3.5 h-3.5" />
          Open
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          className="h-7"
          disabled={columns.length === 0 || !sourceAgentId}
        >
          <Save className="w-3.5 h-3.5" />
          {activeSetId ? "Save" : "Save as..."}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={columns.length === 0 && !sourceAgentId}
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuItem onClick={() => setResetKeepInputsConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear responses only</span>
                <span className="text-[10px] text-muted-foreground">
                  Wipe responses; keep per-variation edits + template input.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setResetConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Reset variations</span>
                <span className="text-[10px] text-muted-foreground">
                  Drop per-variation edits + responses. Keep the template.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClearConfirm(true)}>
              <Eraser className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear all</span>
                <span className="text-[10px] text-muted-foreground">
                  Empty the page; reset the template + test input too.
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border mx-1" />

        <BlindControls />

        <Button
          size="sm"
          variant="default"
          onClick={handleSubmitAll}
          disabled={isSubmittingAll || !canSubmit}
          className="h-7"
        >
          {isSubmittingAll ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          Submit all
        </Button>
      </div>

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !saveAsBusy && setSaveAsOpen(o)}
        title="Save variations comparison"
        description="Give this comparison a name. The template + test input are saved on the set; each variation's full configuration is saved per entry. No agents are created."
        placeholder="My variations comparison"
        confirmLabel="Save"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        modeFilter="variations"
        loadFn={async (setId) => {
          await dispatch(loadVariationsBattleSet({ setId })).unwrap();
        }}
      />

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={(o) => {
          if (!o) setClearConfirm(false);
        }}
        title="Clear all?"
        description="Empties the page entirely — variations, template, test input. Conversations remain in your chat history."
        confirmLabel="Clear"
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
