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
  Save,
  Library,
  Sparkles,
  Activity,
  Eraser,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  clearBattle,
  saveBattle,
  saveBattleAs,
  submitAllBattleColumns,
} from "../redux/thunks";
import {
  selectActiveBattleSetId,
  selectActiveBattleSetName,
  selectBattleColumns,
  selectIsSubmittingAllBattle,
  selectSubmittableBattleColumns,
} from "../redux/selectors";
import { ComparisonSetLoaderDialog } from "./ComparisonSetLoaderDialog";

interface BattleToolbarProps {
  contextWindowOpen: boolean;
  onToggleContextWindow: () => void;
  runsWindowOpen: boolean;
  onToggleRunsWindow: () => void;
}

export function BattleToolbar({
  contextWindowOpen,
  onToggleContextWindow,
  runsWindowOpen,
  onToggleRunsWindow,
}: BattleToolbarProps) {
  const dispatch = useAppDispatch();

  const activeSetId = useAppSelector(selectActiveBattleSetId);
  const activeSetName = useAppSelector(selectActiveBattleSetName);
  const isSubmittingAll = useAppSelector(selectIsSubmittingAllBattle);
  const columns = useAppSelector(selectBattleColumns);
  const submittable = useAppSelector(selectSubmittableBattleColumns);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  const handleSubmitAll = async () => {
    if (submittable.length === 0) {
      toast.info("Pick at least one agent and add input before submitting.");
      return;
    }
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
        </div>

        <div className="flex-1" />

        <Button
          size="sm"
          variant={contextWindowOpen ? "default" : "outline"}
          onClick={onToggleContextWindow}
          className="h-7"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Context
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

        <Button
          size="sm"
          variant="outline"
          onClick={() => setClearConfirm(true)}
          className="h-7"
          disabled={columns.length === 0}
        >
          <Eraser className="w-3.5 h-3.5" />
          Clear
        </Button>

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
    </>
  );
}
