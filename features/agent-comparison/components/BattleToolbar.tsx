"use client";

/**
 * BattleToolbar
 *
 * Single bar at the top of the battle page.
 *  - Active set name + Save / Save As
 *  - Open shared Context window
 *  - Open shared Runs window
 *  - Submit All
 *  - Load a saved set
 *  - Clear page
 */

import { useState } from "react";
import {
  Loader2,
  Play,
  Plus,
  Save,
  Library,
  Zap,
  Activity,
  Eraser,
  RotateCcw,
  ChevronDown,
  SlidersHorizontal,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  addBattleColumn,
  broadcastFollowUpToEmpty,
  clearBattle,
  expandAllBattleColumns,
  resetAllBattleConversations,
  saveBattle,
  saveBattleAs,
  selectBattleReadiness,
  submitAllBattleColumns,
  type BattleColumnReadiness,
} from "../redux/thunks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  selectActiveBattleSetId,
  selectActiveBattleSetName,
  selectBattleColumns,
  selectCollapsedBattleColumnCount,
  selectIsSubmittingAllBattle,
  selectSubmittableBattleColumns,
} from "../redux/selectors";
import { ComparisonSetLoaderDialog } from "./ComparisonSetLoaderDialog";
import {
  SubmitAllPreflightDialog,
  type ColumnReadiness,
} from "./SubmitAllPreflightDialog";

interface BattleToolbarProps {
  contextWindowOpen: boolean;
  onToggleContextWindow: () => void;
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
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
  runSettingsWindowOpen,
  onToggleRunSettingsWindow,
  masterInputWindowOpen,
  onToggleMasterInputWindow,
}: BattleToolbarProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const activeSetId = useAppSelector(selectActiveBattleSetId);
  const activeSetName = useAppSelector(selectActiveBattleSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllBattle);
  const columns = useAppSelector(selectBattleColumns);
  const submittable = useAppSelector(selectSubmittableBattleColumns);
  const collapsedCount = useAppSelector(selectCollapsedBattleColumnCount);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetKeepInputsConfirm, setResetKeepInputsConfirm] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightReadiness, setPreflightReadiness] = useState<ColumnReadiness[]>([]);

  const runSubmit = async () => {
    try {
      const res = await dispatch(submitAllBattleColumns()).unwrap();
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

  const handleSubmitAll = () => {
    if (submittable.length === 0) {
      toast.info("Pick at least one agent before submitting.");
      return;
    }
    // Preflight: compute per-column readiness. If any column is empty,
    // open the dialog so the user can add a shared message or choose
    // to submit only the ready columns.
    // Snapshot via store so we don't have to subscribe at the toolbar
    // level just to evaluate this once on click.
    const readiness: BattleColumnReadiness[] = selectBattleReadiness(
      store.getState(),
    );
    const allReady = readiness.every((r) => r.hasMessage);
    if (readiness.length > 0 && !allReady) {
      setPreflightReadiness(
        readiness.map((r) => ({
          column: columns.find((c) => c.columnId === r.columnId)!,
          agentName: r.agentName,
          hasMessage: r.hasMessage,
          phase: r.phase,
        })),
      );
      setPreflightOpen(true);
      return;
    }
    void runSubmit();
  };

  const handlePreflightSubmitWithSharedMessage = async (message: string) => {
    await dispatch(broadcastFollowUpToEmpty({ text: message })).unwrap();
    await runSubmit();
  };

  const handlePreflightSubmitOnlyReady = async () => {
    await runSubmit();
  };

  const handleSave = async () => {
    if (!activeSetId) {
      setSaveAsOpen(true);
      return;
    }
    try {
      await dispatch(saveBattle()).unwrap();
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
      await dispatch(saveBattleAs({ name })).unwrap();
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
      await dispatch(clearBattle()).unwrap();
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

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Battle
          </span>
          {activeSetName && (
            <span className="text-xs text-foreground truncate max-w-[200px]">
              · {activeSetName}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/70 shrink-0">
            ({columns.length} column{columns.length === 1 ? "" : "s"})
          </span>
          {collapsedCount > 0 && (
            <button
              type="button"
              onClick={() => dispatch(expandAllBattleColumns())}
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
          onClick={() => dispatch(addBattleColumn())}
          className="h-7 ml-1"
          title="Add a new column"
        >
          <Plus className="w-3.5 h-3.5" />
          Add agent
        </Button>

        <div className="flex-1" />

        <Button
          size="sm"
          variant={masterInputWindowOpen ? "default" : "outline"}
          onClick={onToggleMasterInputWindow}
          className="h-7"
        >
          <Zap className="w-3.5 h-3.5" />
          Master input
        </Button>

        <Button
          size="sm"
          variant={contextWindowOpen ? "default" : "outline"}
          onClick={onToggleContextWindow}
          className="h-7"
        >
          <Zap className="w-3.5 h-3.5" />
          Context
        </Button>

        <Button
          size="sm"
          variant={runSettingsWindowOpen ? "default" : "outline"}
          onClick={onToggleRunSettingsWindow}
          className="h-7"
          title="Server-side run caps + flags applied to every column"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Run settings
        </Button>

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
          disabled={columns.length === 0}
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
              disabled={columns.length === 0}
            >
              <Eraser className="w-3.5 h-3.5" />
              Clear
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onClick={() => setResetKeepInputsConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear responses only</span>
                <span className="text-[10px] text-muted-foreground">
                  Wipe responses + context; keep agents AND inputs.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setResetConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Reset conversations</span>
                <span className="text-[10px] text-muted-foreground">
                  Clear responses + inputs; keep agents.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClearConfirm(true)}>
              <Eraser className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear all columns</span>
                <span className="text-[10px] text-muted-foreground">
                  Empty the page; remove agents too.
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-border mx-1" />

        <Button
          size="sm"
          variant="default"
          onClick={handleSubmitAll}
          disabled={isSubmittingAll || submittable.length === 0}
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
        title="Save comparison set"
        description="Give this comparison a name. The underlying conversations are saved automatically as part of normal chat history."
        placeholder="My comparison"
        confirmLabel="Save"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        modeFilter="open"
      />

      <ConfirmDialog
        open={clearConfirm}
        onOpenChange={(o) => {
          if (!o) setClearConfirm(false);
        }}
        title="Clear all columns?"
        description="This empties the page. The underlying conversations are not deleted; reopen them via your chat history. If a comparison set is active, the link to it will be cleared."
        confirmLabel="Clear"
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

      <SubmitAllPreflightDialog
        open={preflightOpen}
        onOpenChange={setPreflightOpen}
        readiness={preflightReadiness}
        onSubmitWithSharedMessage={handlePreflightSubmitWithSharedMessage}
        onSubmitOnlyReady={handlePreflightSubmitOnlyReady}
      />
    </>
  );
}
