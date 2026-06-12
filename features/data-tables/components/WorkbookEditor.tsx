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
import { Download, History, Loader2, Save } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";

import { useWorkbookRealtime } from "../hooks/useWorkbookRealtime";
import { RemoteCursorsLayer } from "./RemoteCursorsLayer";
import { WorkbookCursorOverlay } from "./WorkbookCursorOverlay";
import {
  getLatestSnapshot,
  saveSnapshot,
} from "../workbook-service";
import { isServiceFailure } from "../types";
import { downloadUniverAsXlsx } from "../univer-to-xlsx";
import { WorkbookHistoryViewer } from "./WorkbookHistoryViewer";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type Props = {
  workbookId: string;
  /** Pass false to mount in viewer-only mode (no autosave). */
  editable?: boolean;
  /** Used as the XLSX filename on export. Falls back to workbookId. */
  workbookName?: string;
  /**
   * Opt in to v2 CRDT collab — see `features/data-tables/collab/FEATURE.md`.
   * Defaults to `false` so v1 behavior (snapshot-per-save last-write-wins)
   * is unchanged until the workbook page explicitly turns this on. When
   * `true`, the editor wires a `WorkbookCollabSession`, broadcasts mutations
   * via Supabase Broadcast, and renders a remote-cursors strip in the
   * toolbar. Snapshot writes become host-gated.
   */
  collab?: boolean;
  /**
   * Optional content rendered into the editor's compact top toolbar (left
   * cluster). Use this to push the page-level "back arrow + rename input"
   * INTO the editor's bar so we don't burn a second row above the canvas.
   * On phones every pixel matters; on desktop it dodges the avatar.
   */
  toolbarLeftSlot?: React.ReactNode;
  /**
   * Optional content for the right cluster of the toolbar — typically the
   * <ShareButton>. Renders left of the save-status / Save now / Export /
   * History controls so primary actions stay closest to the canvas.
   */
  toolbarRightSlot?: React.ReactNode;
};

export default function WorkbookEditor({
  workbookId,
  editable = true,
  workbookName,
  collab = false,
  toolbarLeftSlot,
  toolbarRightSlot,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<FUniver | null>(null);
  const univerRef = useRef<Univer | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveByUserRef = useRef<string | null>(null);
  // V2 collab session — null until `collab=true` AND Univer has booted.
  // See `../collab/FEATURE.md` for the full architecture; this ref is the
  // sole live connection between Univer's command service and Yjs.
  const collabSessionRef = useRef<import("../collab/WorkbookCollabSession").WorkbookCollabSession | null>(null);
  // Univer selection-listener disposer, kept ref-side so the unmount path can
  // reach it regardless of which render registered it.
  const collabSelectionDisposerRef = useRef<{ dispose: () => void } | null>(null);
  const [remoteAwareness, setRemoteAwareness] = useState<
    Map<number, import("../collab/types").AwarenessState>
  >(new Map());
  const [collabIsHost, setCollabIsHost] = useState(true); // solo = host by default
  const [collabSelfUid, setCollabSelfUid] = useState<string>("");

  const [bootState, setBootState] = useState<
    "booting" | "ready" | "load_error"
  >("booting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Stable identity for the realtime callback so the hook doesn't resubscribe
  // every render.
  const onRemoteSnapshot = useCallback(
    (evt: { snapshotId: string; createdBy: string | null }) => {
      // V2 (collab=true): the CRDT is the source of truth for live edits,
      // and the elected host writes snapshots as periodic checkpoints. A
      // remote-snapshot hot-swap here would overwrite the local Yjs doc and
      // momentarily desync peers. Suppress unless the local doc is genuinely
      // far behind (a disaster-recovery path tracked separately). For v1
      // (collab=false) the old behavior is preserved: refetch on any remote
      // snapshot from another user.
      if (collab) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collab],
  );

  // V2 disables the snapshot-driven hot-swap (CRDT handles live state);
  // gating the hook call keeps the realtime subscription off entirely when
  // collab is on. Zero overhead, zero redundant refetches.
  useWorkbookRealtime(workbookId, onRemoteSnapshot, { enabled: !collab });

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
              // 'simple' collapses Univer's "Start / Formulas / Data" ribbon
              // tabs into a single icon row — keeps the editor's vertical
              // footprint tight (Google-Sheets-shaped), which matters on
              // phones and short laptop screens.
              ribbonType: "simple",
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
            // V2: only the elected host writes the canonical snapshot.
            // Solo / no-collab path: collabIsHost defaults true, so we save.
            if (collab && !collabIsHost) return;
            void performSave();
          }, 2500);
        });

        // V2 CRDT collab — opt-in. Mounted only after Univer is ready so we
        // can resolve ICommandService and the local user identity.
        //
        // Fire-and-forget with a hard try/catch: a failure in collab boot
        // (offline, broken injector path, dynamic-import miss, permission
        // glitch) must NEVER take the workbook page down. The user keeps a
        // working solo workbook; collab silently degrades with a console
        // warning that surfaces in error tracking.
        if (collab) {
          void startCollabSession().catch((err) => {
            console.warn(
              "[workbook] collab boot failed — falling back to solo mode",
              err,
            );
          });
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setBootState("load_error");
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      collabSelectionDisposerRef.current?.dispose();
      collabSelectionDisposerRef.current = null;
      collabSessionRef.current?.stop();
      collabSessionRef.current = null;
      univerRef.current?.dispose();
      univerRef.current = null;
      apiRef.current = null;
    };
    // Re-mount when the workbookId changes (route navigation) OR when
    // collab is toggled (boots a different session shape).
  }, [workbookId, editable, collab]);

  // Lazy-import the collab classes so the bundle for non-collab users stays
  // free of yjs / y-protocols. Resolved at session-start time only.
  const startCollabSession = useCallback(async () => {
    if (!univerRef.current) return;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    setCollabSelfUid(uid);

    const [{ WorkbookCollabSession }, { SupabaseYjsProvider }] =
      await Promise.all([
        import("../collab/WorkbookCollabSession"),
        import("../collab/SupabaseYjsProvider"),
      ]);

    // Univer's `__getInjector` is technically a private path (the double
    // underscore is the warning). On some build/runtime combos it returns
    // undefined or `injector.get(ICommandService)` returns undefined; both
    // would crash the page if uncaught. Probe defensively — when we can't
    // resolve the command service, log + return so the editor runs in
    // solo-without-collab mode rather than tearing down the route.
    let commandService:
      | import("../collab/WorkbookCollabSession").CommandServiceLike
      | null = null;
    try {
      const injector = (univerRef.current as unknown as {
        __getInjector?: () => {
          get: <T>(token: unknown) => T | undefined;
        };
      }).__getInjector?.();
      if (!injector) {
        console.warn("[workbook] collab: Univer injector unavailable");
        return;
      }
      const { ICommandService } = await import("@univerjs/core");
      const resolved = injector.get<
        import("../collab/WorkbookCollabSession").CommandServiceLike
      >(ICommandService as unknown);
      if (!resolved || typeof resolved.onMutationExecutedForCollab !== "function") {
        console.warn(
          "[workbook] collab: ICommandService missing the onMutationExecutedForCollab hook",
        );
        return;
      }
      commandService = resolved;
    } catch (err) {
      console.warn("[workbook] collab: command-service resolution threw", err);
      return;
    }

    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const session = new WorkbookCollabSession({
      workbookId,
      uid,
      clientId,
      commandService,
      makeProvider: ({ workbookId: wid, clientId: cid, doc, awareness }) =>
        new SupabaseYjsProvider({
          workbookId: wid,
          clientId: cid,
          doc,
          awareness,
        }),
      onAwarenessChange: (aw) => {
        setRemoteAwareness(
          new Map(aw.getStates() as Map<
            number,
            import("../collab/types").AwarenessState
          >),
        );
        const election = session.electHost();
        setCollabIsHost(election.isHost);
      },
    });

    collabSessionRef.current = session;
    await session.start();

    // Stream local selection changes into Awareness so remote peers can
    // render this user's cell ring. Defensive: facade typings are loose at
    // the .onSelectionChange boundary; on a Univer build where the method
    // is missing we just skip cursor broadcasting — sessions still sync
    // mutations + presence (uid + color) without cell coords.
    try {
      const fb = (apiRef.current as unknown as {
        getActiveWorkbook?: () => {
          getActiveSheet?: () => { getSheetId: () => string } | null;
          onSelectionChange?: (
            cb: (
              selections: Array<{ startRow: number; startColumn: number }>,
            ) => void,
          ) => { dispose: () => void };
        } | undefined;
      } | null)?.getActiveWorkbook?.();
      if (fb?.onSelectionChange) {
        const disposer = fb.onSelectionChange((selections) => {
          if (!collabSessionRef.current) return;
          const first = selections?.[0];
          if (!first) return;
          const sheetId = fb.getActiveSheet?.()?.getSheetId() ?? null;
          collabSessionRef.current.setCursor({
            sheetId,
            row: first.startRow,
            col: first.startColumn,
          });
        });
        collabSelectionDisposerRef.current = disposer;
      }
    } catch (err) {
      console.warn("[workbook] collab: selection wiring failed", err);
    }
  }, [workbookId]);

  // Stable save fn — pulled out so the timer callback and the manual-save
  // button can both reach it.
  const performSave = useCallback(
    async (origin: "autosave" | "manual" = "autosave") => {
      if (!apiRef.current) return;
      const workbook = apiRef.current.getActiveWorkbook();
      if (!workbook) return;
      const snapshot = workbook.getSnapshot();
      setSaveStatus("saving");

      const { data: userData } = await supabase.auth.getUser();
      lastSaveByUserRef.current = userData?.user?.id ?? null;

      const res = await saveSnapshot({ workbookId, snapshot, origin });
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
      if (origin === "manual") {
        toast({ title: "Snapshot saved", variant: "success" });
      }
      // Drop the "saved" indicator after a moment to reduce visual noise.
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    },
    [workbookId],
  );

  const handleSaveNow = useCallback(() => {
    // Cancel any pending autosave so we don't race ourselves.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave("manual");
  }, [performSave]);

  const handleExportXlsx = useCallback(() => {
    if (!apiRef.current) return;
    const workbook = apiRef.current.getActiveWorkbook();
    if (!workbook) return;
    try {
      const snapshot = workbook.getSnapshot();
      downloadUniverAsXlsx(snapshot, {
        filename: workbookName ?? workbookId,
      });
    } catch (err) {
      toast({
        title: "Could not export workbook",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }, [workbookId, workbookName]);

  // Save-status pill text/style.
  const statusPill = useMemo(() => statusPillFor(saveStatus), [saveStatus]);

  return (
    // colorScheme: light pins this subtree to the light palette so Univer's
    // portal popovers / context menus (which read browser color-scheme to
    // decide their background) don't half-render against our dark app
    // surfaces. The Univer canvas itself was always light; the popovers
    // were where the visual collision happened.
    <div
      className="matrx-univer-shell flex h-full w-full flex-col bg-card"
      style={{ colorScheme: "light" }}
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-xs min-w-0">
        {/* Left cluster — caller-supplied (back arrow + rename) when this
            editor lives on the workbook page, empty otherwise. */}
        {toolbarLeftSlot && (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {toolbarLeftSlot}
          </div>
        )}
        {!toolbarLeftSlot && (
          <div className="text-muted-foreground flex-1 min-w-0 truncate">
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
            {bootState === "ready" && (
              <span>{editable ? "Editing" : "Viewing"}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {collab && bootState === "ready" && (
            <RemoteCursorsLayer
              states={remoteAwareness}
              selfUid={collabSelfUid}
            />
          )}
          {/* Compact status pill (icon only on phones, full text on sm+). */}
          {bootState === "ready" && saveStatus !== "idle" && (
            <div className={`hidden sm:flex items-center gap-1 ${statusPill.className}`}>
              {statusPill.icon}
              <span>{statusPill.text}</span>
            </div>
          )}
          {toolbarRightSlot}
          {editable && bootState === "ready" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleSaveNow}
              disabled={saveStatus === "saving"}
              title="Save a labeled snapshot now (bypass autosave debounce)"
            >
              <Save className="size-3" />
              <span className="hidden sm:inline">Save now</span>
            </Button>
          )}
          {bootState === "ready" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleExportXlsx}
              title="Download as .xlsx"
            >
              <Download className="size-3" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setHistoryOpen(true)}
            title="View snapshot history"
          >
            <History className="size-3" />
            <span className="hidden sm:inline">History</span>
          </Button>
        </div>
      </div>
      {/* Relative wrapper so the absolute cursor overlay layers inside it
          (not over the whole viewport) and the Univer canvas keeps its own
          flex sizing. */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {collab && bootState === "ready" && (
          <WorkbookCursorOverlay
            univerAPI={apiRef.current}
            containerRef={containerRef}
            states={remoteAwareness}
            selfUid={collabSelfUid}
          />
        )}
      </div>

      <Sheet
        open={historyOpen}
        onOpenChange={(open) => setHistoryOpen(open)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Workbook history</SheetTitle>
            <SheetDescription>
              Every saved snapshot, newest first. Restore brings an older
              snapshot back as the new current state (the previous one stays
              in history).
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <WorkbookHistoryViewer
              workbookId={workbookId}
              editable={editable}
            />
          </div>
        </SheetContent>
      </Sheet>
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
