"use client";

/**
 * RequestModToolbar — Mode-5 toolbar.
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
  setRequestModColumnCollapsed,
  setRequestModColumns,
} from "../redux/slice";
import {
  addColumnToRequestModBattle,
  clearRequestModBattle,
  loadRequestModBattleSet,
  resetAllRequestModConversations,
  saveRequestModBattle,
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
      const res = await dispatch(submitAllRequestMod()).unwrap();
      const parts: string[] = [];
      if (res.launched > 0) parts.push(`${res.launched} launched`);
      if (res.skipped > 0) parts.push(`${res.skipped} skipped (empty)`);
      if (res.failed > 0) parts.push(`${res.failed} failed`);
      if (res.launched === 0 && res.skipped > 0) {
        toast.error(
          "Nothing to launch — every column is empty. Type a message or fill variables in each column first.",
        );
      } else if (res.failed > 0) {
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
      await dispatch(saveRequestModBattle()).unwrap();
      toast.success(`Saved "${activeSetName}"`);
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
      toast.success(`Saved as "${name}"`);
    } catch (err) {
      toast.error(
        `Couldn't save: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setSaveAsBusy(false);
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

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Request mod battle
          </span>
          {activeSetName && (
            <span className="text-xs text-foreground truncate max-w-[200px]">
              · {activeSetName}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/70 shrink-0">
            ({columns.length} request{columns.length === 1 ? "" : "s"})
          </span>
          {collapsedCount > 0 && (
            <button
              type="button"
              onClick={handleExpandAll}
              title={`Click to expand all ${collapsedCount} collapsed column${
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
          onClick={() => dispatch(addColumnToRequestModBattle(undefined))}
          className="h-7 ml-1"
          disabled={!agentId}
          title={
            agentId
              ? "Add a new request column"
              : "Pick a locked agent first, then add request columns"
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Add request
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
          disabled={columns.length === 0 || !agentId}
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
              disabled={columns.length === 0 && !agentId}
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
                  Wipe responses; keep per-column inputs intact.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setResetConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Reset columns</span>
                <span className="text-[10px] text-muted-foreground">
                  Drop per-column inputs + responses. Keep the locked agent.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClearConfirm(true)}>
              <Eraser className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear all</span>
                <span className="text-[10px] text-muted-foreground">
                  Empty the page; reset the locked agent too.
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
        title="Save request-mod comparison"
        description="Give this comparison a name. The locked agent is saved as part of the set; per-column inputs are saved per entry."
        placeholder="My request comparison"
        confirmLabel="Save"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        modeFilter="request-mod"
        loadFn={async (setId) => {
          await dispatch(loadRequestModBattleSet({ setId })).unwrap();
        }}
      />

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={(o) => {
          if (!o) setClearConfirm(false);
        }}
        title="Clear all?"
        description="Empties the page entirely — columns, locked agent. Conversations remain in your chat history."
        confirmLabel="Clear"
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
