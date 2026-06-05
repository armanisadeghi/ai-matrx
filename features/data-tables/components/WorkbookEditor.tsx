/**
 * WorkbookEditor — mounts Univer for one workbook.
 *
 * V1 storage model (matches `udt_v2_workbook_snapshots.sql`):
 *   - Load: read the LATEST snapshot for the workbook; if none, create an
 *     empty workbook.
 *   - Save: debounce 2.5s after the last edit, then write a NEW row to
 *     udt_workbook_snapshots. Append-only.
 *   - Realtime: subscribe to snapshot inserts; if a new snapshot arrives
 *     from a DIFFERENT user, hot-swap the workbook with the new snapshot.
 *     Snapshots from the CURRENT user are ignored (we just wrote it).
 *
 * NOT a CRDT layer. Concurrent edits = last-write-wins on the snapshot row.
 * Real per-cell collab (Yjs / Univer's @univerjs/collaboration plugin) is
 * a follow-up phase; this is the foundation it would build on.
 *
 * SSR: this component is "use client". The page that renders it should use
 * dynamic import with `ssr: false` so Univer never executes server-side.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  createUniver,
  LocaleType,
  merge,
  type FUniver,
} from "@univerjs/presets";
import type { IWorkbookData, Univer } from "@univerjs/core";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import "@univerjs/preset-sheets-core/lib/index.css";

import { supabase } from "@/utils/supabase/client";
import { toast } from "@/components/ui/use-toast";

import { useWorkbookRealtime } from "../hooks/useWorkbookRealtime";
import {
  getLatestSnapshot,
  saveSnapshot,
} from "../workbook-service";
import { isServiceFailure } from "../types";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type Props = {
  workbookId: string;
  /** Pass false to mount in viewer-only mode (no autosave). */
  editable?: boolean;
};

export default function WorkbookEditor({ workbookId, editable = true }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<FUniver | null>(null);
  const univerRef = useRef<Univer | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveByUserRef = useRef<string | null>(null);

  const [bootState, setBootState] = useState<
    "booting" | "ready" | "load_error"
  >("booting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Stable identity for the realtime callback so the hook doesn't resubscribe
  // every render.
  const onRemoteSnapshot = useCallback(
    (evt: { snapshotId: string; createdBy: string | null }) => {
      if (
        evt.createdBy &&
        lastSaveByUserRef.current &&
        evt.createdBy === lastSaveByUserRef.current
      ) {
        // Our own save echoed back via realtime — ignore.
        return;
      }
      // A different client saved. Refetch + reload.
      void reloadFromLatest();
    },
    // reloadFromLatest is stable via useCallback below; including it would
    // create a cycle. Captured by ref via apiRef.
    [],
  );

  useWorkbookRealtime(workbookId, onRemoteSnapshot);

  const reloadFromLatest = useCallback(async () => {
    if (!apiRef.current) return;
    const res = await getLatestSnapshot(workbookId);
    if (isServiceFailure(res)) {
      toast({
        title: "Could not load latest workbook state",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    const snapshot = res.data?.snapshot;
    if (snapshot) {
      // Boundary cast: snapshot was written by Univer itself (or our default
      // shape from defaultEmptyWorkbook); it's stored as opaque JSONB.
      apiRef.current.createWorkbook(snapshot as Partial<IWorkbookData>);
    }
  }, [workbookId]);

  // Boot Univer once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { univer, univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: { [LocaleType.EN_US]: merge({}, sheetsCoreEnUS) },
          presets: [
            UniverSheetsCorePreset({
              container: containerRef.current as HTMLElement,
            }),
          ],
        });
        if (cancelled) {
          univer.dispose();
          return;
        }
        univerRef.current = univer;
        apiRef.current = univerAPI;

        // Hydrate from the latest persisted snapshot, or create empty.
        const res = await getLatestSnapshot(workbookId);
        if (cancelled) return;
        if (isServiceFailure(res)) {
          setLoadError(res.error);
          setBootState("load_error");
          return;
        }
        const initial: Partial<IWorkbookData> =
          (res.data?.snapshot as Partial<IWorkbookData>) ??
          defaultEmptyWorkbook();
        apiRef.current.createWorkbook(initial);
        setBootState("ready");

        if (!editable) return;

        // Hook command stream → debounced autosave.
        apiRef.current.onCommandExecuted(() => {
          setSaveStatus("dirty");
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            void performSave();
          }, 2500);
        });
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setBootState("load_error");
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      univerRef.current?.dispose();
      univerRef.current = null;
      apiRef.current = null;
    };
    // Re-mount when the workbookId changes (route navigation).
  }, [workbookId, editable]);

  // Stable save fn — pulled out so the timer callback can reach it.
  const performSave = useCallback(async () => {
    if (!apiRef.current) return;
    const workbook = apiRef.current.getActiveWorkbook();
    if (!workbook) return;
    const snapshot = workbook.getSnapshot();
    setSaveStatus("saving");

    const { data: userData } = await supabase.auth.getUser();
    lastSaveByUserRef.current = userData?.user?.id ?? null;

    const res = await saveSnapshot({ workbookId, snapshot });
    if (isServiceFailure(res)) {
      setSaveStatus("error");
      toast({
        title: "Could not save workbook",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    setSaveStatus("saved");
    // Drop the "saved" indicator after a moment to reduce visual noise.
    setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
  }, [workbookId]);

  // Save-status pill text/style.
  const statusPill = useMemo(() => statusPillFor(saveStatus), [saveStatus]);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs">
        <div className="text-muted-foreground">
          {bootState === "booting" && (
            <span className="flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" />
              Loading workbook…
            </span>
          )}
          {bootState === "load_error" && (
            <span className="text-destructive">
              Load failed: {loadError ?? "unknown"}
            </span>
          )}
          {bootState === "ready" && <span>{editable ? "Editing" : "Viewing"}</span>}
        </div>
        <div className={`flex items-center gap-1 ${statusPill.className}`}>
          {statusPill.icon}
          <span>{statusPill.text}</span>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function defaultEmptyWorkbook(): Partial<IWorkbookData> {
  // Univer's IWorkbookData with one default sheet. The shape is intentionally
  // minimal — Univer fills in defaults when fields are absent.
  return {
    id: cryptoRandomId(),
    sheetOrder: ["sheet-1"],
    name: "Untitled workbook",
    appVersion: "1",
    locale: LocaleType.EN_US,
    styles: {},
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet1",
        cellData: {},
        rowCount: 100,
        columnCount: 26,
      },
    },
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `wb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function statusPillFor(s: SaveStatus): {
  text: string;
  icon: React.ReactNode;
  className: string;
} {
  switch (s) {
    case "saving":
      return {
        text: "Saving…",
        icon: <Loader2 className="size-3 animate-spin" />,
        className: "text-muted-foreground",
      };
    case "saved":
      return {
        text: "Saved",
        icon: null,
        className: "text-emerald-600 dark:text-emerald-500",
      };
    case "dirty":
      return {
        text: "Unsaved changes",
        icon: null,
        className: "text-amber-600 dark:text-amber-500",
      };
    case "error":
      return {
        text: "Save failed",
        icon: null,
        className: "text-destructive",
      };
    default:
      return { text: "", icon: null, className: "" };
  }
}
