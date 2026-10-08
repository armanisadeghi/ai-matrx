"use client";

/**
 * MatrixToolbar — the shared BattleHeader with the matrix mode's actions.
 */

import { useState } from "react";
import { recordToast, toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import { BattleHeader, type BattleAction } from "@/features/agent-comparison/shared/BattleHeader";
import { setActiveMatrixSet } from "../redux/slice";
import {
  archiveMatrixBattle,
  cancelMatrixBattle,
  clearMatrixBattle,
  renameMatrixBattle,
  runMatrixBattle,
  saveMatrixBattle,
  saveMatrixBattleAs,
} from "../redux/thunks";
import {
  selectMatrixCellCount,
  selectMatrixCells,
  selectMatrixDirty,
  selectMatrixLiveCount,
  selectMatrixProblems,
  selectMatrixRunInFlight,
  selectMatrixSetId,
  selectMatrixSetName,
} from "../redux/selectors";

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export function MatrixToolbar({ onRunStarted }: { onRunStarted: () => void }) {
  const dispatch = useAppDispatch();
  const setId = useAppSelector(selectMatrixSetId);
  const setName = useAppSelector(selectMatrixSetName);
  const dirty = useAppSelector(selectMatrixDirty);
  const cells = useAppSelector(selectMatrixCells);
  const cellCount = useAppSelector(selectMatrixCellCount);
  const liveCount = useAppSelector(selectMatrixLiveCount);
  const runInFlight = useAppSelector(selectMatrixRunInFlight);
  const problems = useAppSelector(selectMatrixProblems);

  const [loaderOpen, setLoaderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rerunAllConfirm, setRerunAllConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [newConfirm, setNewConfirm] = useState(false);

  const run = async (scope: "all" | "unfinished") => {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    onRunStarted();
    try {
      await dispatch(runMatrixBattle({ cells: null, scope })).unwrap();
    } catch (err) {
      toast.error(`Run failed: ${message(err)}`);
    }
  };

  const save = async () => {
    try {
      const saved = await dispatch(saveMatrixBattle()).unwrap();
      recordToast.success(
        { type: "agent_comparison_battle", id: saved.id, title: saved.name },
        saved.created ? "Battle saved" : "Changes saved",
      );
    } catch (err) {
      toast.error(`Couldn't save: ${message(err)}`);
    }
  };

  const cancel = async () => {
    try {
      await dispatch(cancelMatrixBattle()).unwrap();
    } catch (err) {
      toast.error(`Couldn't cancel: ${message(err)}`);
    }
  };

  const archive = async () => {
    setArchiveConfirm(false);
    try {
      const res = await dispatch(archiveMatrixBattle()).unwrap();
      if (res.failedConversations > 0) {
        toast.warning("Battle archived", {
          description: `${res.failedConversations} cell conversations could not be archived.`,
        });
      } else {
        toast.success(`Battle and ${res.archivedConversations} conversations archived`);
      }
    } catch (err) {
      toast.error(`Couldn't archive: ${message(err)}`);
    }
  };

  const completed = cells.filter((c) => c.status === "completed").length;
  const conversationCount = new Set(
    cells.flatMap((c) => [c.conversationId, ...c.history.map((h) => h.conversationId)]).filter(Boolean),
  ).size;
  const actions: BattleAction[] = [
    { icon: "Library", label: "Open a saved battle", onPress: () => setLoaderOpen(true) },
    {
      icon: "Save",
      label: setId ? (dirty ? "Save changes" : "Saved") : "Save battle",
      onPress: () => void save(),
    },
    ...(setId
      ? [
          { icon: "Pencil", label: "Rename battle…", onPress: () => setRenameOpen(true) },
          { icon: "Copy", label: "Save a copy…", onPress: () => setSaveAsOpen(true) },
        ]
      : []),
    ...(setId && cells.length > 0
      ? [
          {
            icon: "RotateCcw",
            label: "Re-run every cell",
            short: "Re-run all",
            onPress: () => setRerunAllConfirm(true),
          },
        ]
      : []),
    ...(liveCount > 0 || runInFlight
      ? [{ icon: "Square", label: "Cancel running cells", short: "Cancel", destructive: true, onPress: () => void cancel() }]
      : []),
    ...(setId
      ? [
          {
            icon: "Archive",
            label: "Archive battle and its conversations",
            short: "Archive",
            destructive: true,
            onPress: () => setArchiveConfirm(true),
          },
        ]
      : []),
    { icon: "SquarePlus", label: "Start a new battle", destructive: true, onPress: () => setNewConfirm(true) },
  ];

  return (
    <>
      <BattleHeader
        battleName={setName}
        fallbackTitle="Matrix battle"
        actions={actions}
        onSubmit={() => void run("unfinished")}
        submitting={runInFlight}
        canSubmit={problems.length === 0}
        submitTitle="Run every cell that has not completed"
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        mode="matrix"
        activeSetId={setId}
        onDeleted={(id) => {
          if (id === setId) dispatch(setActiveMatrixSet(null));
        }}
      />

      <TextInputDialog
        open={renameOpen}
        onOpenChange={(o) => !busy && setRenameOpen(o)}
        title="Rename battle"
        placeholder="Battle name"
        defaultValue={setName ?? ""}
        confirmLabel="Rename"
        busy={busy}
        onConfirm={async (name: string) => {
          setBusy(true);
          try {
            await dispatch(renameMatrixBattle({ name })).unwrap();
            setRenameOpen(false);
          } catch (err) {
            toast.error(`Couldn't rename: ${message(err)}`);
          } finally {
            setBusy(false);
          }
        }}
      />

      <TextInputDialog
        open={saveAsOpen}
        onOpenChange={(o) => !busy && setSaveAsOpen(o)}
        title="Save a copy"
        description="Same setup, no results."
        placeholder="Battle name"
        defaultValue={setName ? `${setName} copy` : ""}
        confirmLabel="Save copy"
        busy={busy}
        onConfirm={async (name: string) => {
          setBusy(true);
          try {
            await dispatch(saveMatrixBattleAs({ name })).unwrap();
            setSaveAsOpen(false);
            toast.success(`Saved a copy as "${name}"`);
          } catch (err) {
            toast.error(`Couldn't save: ${message(err)}`);
          } finally {
            setBusy(false);
          }
        }}
      />

      <ConfirmDialog
        open={rerunAllConfirm}
        onOpenChange={(o) => !o && setRerunAllConfirm(false)}
        title={`Re-run all ${cellCount} cells?`}
        description={`Spends ${cellCount} new runs. The ${completed} finished results are replaced; their conversations stay in history.`}
        confirmLabel="Re-run all"
        variant="destructive"
        onConfirm={() => {
          setRerunAllConfirm(false);
          void run("all");
        }}
      />

      <ConfirmDialog
        open={archiveConfirm}
        onOpenChange={(o) => !o && setArchiveConfirm(false)}
        title="Archive this battle?"
        description={`Archives the battle and its ${conversationCount} conversations, earlier attempts included. Restore them from Trash.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() => void archive()}
      />

      <ConfirmDialog
        open={newConfirm}
        onOpenChange={(o) => !o && setNewConfirm(false)}
        title="Start a new battle?"
        description={
          setId
            ? dirty
              ? "Empties the page. Unsaved setup changes are lost; the saved battle stays."
              : "Empties the page. This battle stays in Open a saved battle."
            : "Empties the page. This battle was never saved."
        }
        confirmLabel="Start new"
        variant="destructive"
        onConfirm={() => {
          setNewConfirm(false);
          void dispatch(clearMatrixBattle());
        }}
      />
    </>
  );
}
