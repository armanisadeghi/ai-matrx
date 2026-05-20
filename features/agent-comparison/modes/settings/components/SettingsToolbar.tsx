"use client";

/**
 * SettingsToolbar
 *
 * Mode-2 toolbar. Mirrors Mode-1's layout but the actions reflect the
 * locked-axis model:
 *   - Add variant       — adds a settings column under the locked agent
 *   - Runs              — shared runs comparison window (reusable)
 *   - Open / Save as    — comparison-set persistence (settings-mode aware)
 *   - Clear (dropdown)  — Clear responses (keep settings + locked input)
 *                       / Reset variants (drop overrides + responses)
 *                       / Clear all (also drop locked input)
 *   - Submit all        — broadcasts locked input + runs every variant
 *
 * The Master input + Run settings windows from Mode 1 don't fit here —
 * Settings mode is BUILT around per-column run settings (each column is
 * a settings variant) and the input is shared by design, not optional.
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
import { PresetMenu } from "./PresetMenu";
import {
  setSettingsColumnCollapsed,
  setSettingsColumns,
} from "../redux/slice";
import {
  addColumnToSettingsBattle,
  clearSettingsBattle,
  loadSettingsBattleSet,
  resetAllSettingsConversations,
  saveSettingsBattle,
  saveSettingsBattleAs,
  submitAllSettings,
} from "../redux/thunks";
import {
  selectActiveSettingsSetId,
  selectActiveSettingsSetName,
  selectCanSubmitSettings,
  selectCollapsedSettingsColumnCount,
  selectIsSubmittingAllSettings,
  selectLockedAgentId,
  selectLockedSetup,
  selectSettingsColumns,
} from "../redux/selectors";

interface Props {
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function SettingsToolbar({
  runsWindowOpen,
  onToggleRunsWindow,
}: Props) {
  const dispatch = useAppDispatch();

  const lockedAgentId = useAppSelector(selectLockedAgentId);
  const lockedSetup = useAppSelector(selectLockedSetup);
  const activeSetId = useAppSelector(selectActiveSettingsSetId);
  const activeSetName = useAppSelector(selectActiveSettingsSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllSettings);
  const canSubmit = useAppSelector(selectCanSubmitSettings);
  const columns = useAppSelector(selectSettingsColumns);
  const collapsedCount = useAppSelector(selectCollapsedSettingsColumnCount);
  const maybeShuffleForBlind = useBlindShuffle();

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetKeepInputsConfirm, setResetKeepInputsConfirm] = useState(false);

  const handleSubmitAll = async () => {
    // Preflight: walk the locked setup and surface SPECIFIC missing
    // pieces rather than a generic "fill it in" message. The locked
    // input is a single page-level form so the user can fix it inline
    // immediately — no dialog needed.
    if (!lockedAgentId) {
      toast.error("Pick an agent in the Locked input section first.");
      return;
    }
    if (columns.length === 0) {
      toast.error(
        "Add at least one variant. Click the 'Add variant' button to start.",
      );
      return;
    }
    if (!lockedSetup.userMessage.trim()) {
      // Variables may be filled but no message — the agent still needs
      // something to act on for most use cases. Allow it with a warning
      // if at least one variable is set; otherwise hard-block.
      const hasVars = Object.values(lockedSetup.variables).some((v) => {
        if (v == null) return false;
        if (typeof v === "string") return v.trim().length > 0;
        return true;
      });
      if (!hasVars) {
        toast.error(
          "Add a user message in the Locked input section before submitting.",
        );
        return;
      }
    }
    try {
      maybeShuffleForBlind(columns, setSettingsColumns);
      const res = await dispatch(submitAllSettings()).unwrap();
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
      await dispatch(saveSettingsBattle()).unwrap();
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
      await dispatch(saveSettingsBattleAs({ name })).unwrap();
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
      await dispatch(clearSettingsBattle()).unwrap();
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
        resetAllSettingsConversations({ preserveInputs: false }),
      ).unwrap();
      toast.success("Variants reset (overrides cleared)");
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
        resetAllSettingsConversations({ preserveInputs: true }),
      ).unwrap();
      toast.success("Responses cleared · variants + locked input preserved");
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
          setSettingsColumnCollapsed({ columnId: col.columnId, collapsed: false }),
        );
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings battle
          </span>
          {activeSetName && (
            <span className="text-xs text-foreground truncate max-w-[200px]">
              · {activeSetName}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/70 shrink-0">
            ({columns.length} variant{columns.length === 1 ? "" : "s"})
          </span>
          {collapsedCount > 0 && (
            <button
              type="button"
              onClick={handleExpandAll}
              title={`Click to expand all ${collapsedCount} collapsed variant${
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
          onClick={() => dispatch(addColumnToSettingsBattle(undefined))}
          className="h-7 ml-1"
          disabled={!lockedAgentId}
          title={
            lockedAgentId
              ? "Add a new variant"
              : "Pick a locked agent first, then add variants"
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Add variant
        </Button>

        <PresetMenu />

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
          disabled={columns.length === 0 || !lockedAgentId}
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
              disabled={columns.length === 0 && !lockedAgentId}
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
                  Wipe responses; keep variants + locked input.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setResetConfirm(true)}>
              <RotateCcw className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Reset variants</span>
                <span className="text-[10px] text-muted-foreground">
                  Drop per-column overrides + responses. Keep agent + inputs.
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setClearConfirm(true)}>
              <Eraser className="w-3.5 h-3.5" />
              <div className="flex flex-col">
                <span>Clear all</span>
                <span className="text-[10px] text-muted-foreground">
                  Empty the page; reset the locked agent + inputs too.
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
        title="Save settings comparison"
        description="Give this comparison a name. The locked agent + variables + user message are saved as part of the set; per-column settings are saved per entry."
        placeholder="My settings comparison"
        confirmLabel="Save"
        busy={saveAsBusy}
        onConfirm={handleSaveAsConfirm}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        modeFilter="settings"
        loadFn={async (setId) => {
          await dispatch(loadSettingsBattleSet({ setId })).unwrap();
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
        description="Drops every variant's per-column LLM overrides and streamed responses. The locked agent + variables + user message are preserved."
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
        description="Discards streamed responses on every variant, but preserves the per-column overrides AND the locked input. Useful when you want to re-run the same configuration against a clean slate."
        confirmLabel="Clear responses"
        variant="destructive"
        onConfirm={handleClearResponsesKeepInputs}
      />
    </>
  );
}
