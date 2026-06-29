/**
 * DocumentEditor — mounts Univer (preset-docs-core) for one document.
 *
 * Direct mirror of `WorkbookEditor` for documents:
 *   - Load: read the LATEST snapshot for the document; if none, create empty.
 *   - Save: debounce 2.5s after the last edit; write a NEW row to
 *     `udt_document_snapshots`. Append-only.
 *   - Realtime: subscribe to snapshot inserts; on a DIFFERENT user's write,
 *     hot-swap the document with the new snapshot. Own writes are ignored.
 *   - Collab (opt-in): when `collab=true`, mount a `WorkbookCollabSession`
 *     against the docs ICommandService and broadcast over Yjs / Supabase
 *     Broadcast using `channelPrefix: "document"` for namespace isolation.
 *
 * SSR: this is "use client". The page that renders it should use dynamic
 * import with `ssr: false` so Univer never executes server-side.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Save } from "lucide-react";

import {
  createUniver,
  defaultTheme,
  LocaleType,
  merge,
  type FUniver,
} from "@univerjs/presets";
import type { IDocumentData, Univer } from "@univerjs/core";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import docsCoreEnUS from "@univerjs/preset-docs-core/locales/en-US";
import "@univerjs/preset-docs-core/lib/index.css";

import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { toast } from "@/components/ui/use-toast";

import { useDocumentRealtime } from "../hooks/useDocumentRealtime";
import { useUniverDarkModeSync } from "../hooks/useUniverDarkModeSync";
import { sanitizeUniverDocSnapshot } from "../utils/sanitizeUniverDocSnapshot";
import { disposeUniverInstance } from "../utils/disposeUniverInstance";
import { RemoteCursorsLayer } from "./RemoteCursorsLayer";
import {
  getLatestDocumentSnapshot,
  saveDocumentSnapshot,
} from "../document-service";
import { isServiceFailure } from "../types";
import { DocumentHistoryViewer } from "./DocumentHistoryViewer";
import { DocumentPageReferenceCopyButton } from "./DocumentPageReferenceCopyButton";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type Props = {
  documentId: string;
  /** Pass false to mount in viewer-only mode (no autosave). */
  editable?: boolean;
  /** Used as the document display name on export / shell. Falls back to documentId. */
  documentName?: string;
  /**
   * Opt in to v2 CRDT collab — see `features/data-tables/collab/FEATURE.md`.
   * Reuses the same `WorkbookCollabSession` infrastructure (Univer's
   * ICommandService is one service for both sheets and docs; the docs
   * mutation hook signatures match). Channel namespace is isolated via
   * the provider's `channelPrefix: "document"` so docs and workbooks
   * never share a broadcast room even if their UUIDs collide.
   */
  collab?: boolean;
  /**
   * Optional content rendered into the editor's top toolbar (left cluster).
   * Use this to push the page-level "back arrow + rename input" INTO the
   * editor bar so we don't burn a second row above the canvas.
   */
  toolbarLeftSlot?: React.ReactNode;
  /** Optional right-cluster slot — typically the <ShareButton>. */
  toolbarRightSlot?: React.ReactNode;
};

export default function DocumentEditor({
  documentId,
  editable = true,
  documentName,
  collab = false,
  toolbarLeftSlot,
  toolbarRightSlot,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<FUniver | null>(null);
  const univerRef = useRef<Univer | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveByUserRef = useRef<string | null>(null);
  const collabSessionRef = useRef<
    import("../collab/WorkbookCollabSession").WorkbookCollabSession | null
  >(null);
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

  // Univer boots ONCE per documentId (see boot effect). `editable`, `collab`,
  // and the collab host-election flag can all change AFTER boot, so we read
  // them from refs inside the long-lived command listener rather than putting
  // them in the effect deps — recreating Univer on a prop toggle is what made
  // content load then vanish (disposing Univer mid-render crashes its popups).
  const editableRef = useRef(editable);
  const collabRef = useRef(collab);
  const collabIsHostRef = useRef(collabIsHost);
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);
  useEffect(() => {
    collabRef.current = collab;
  }, [collab]);
  useEffect(() => {
    collabIsHostRef.current = collabIsHost;
  }, [collabIsHost]);

  // Initial dark-mode value for createUniver. Live changes are handled by
  // useUniverDarkModeSync below; this just avoids a light→dark flash on boot.
  const themeMode = useAppSelector((s) => s.theme.mode);
  const darkModeRef = useRef(themeMode === "dark");
  useEffect(() => {
    darkModeRef.current = themeMode === "dark";
  }, [themeMode]);

  // Keep Univer's dark mode in lockstep with the app theme (Facade API).
  useUniverDarkModeSync(apiRef, bootState === "ready");

  const onRemoteSnapshot = useCallback(
    (evt: { snapshotId: string; createdBy: string | null }) => {
      // V2 (collab=true): CRDT is the source of truth; snapshots are
      // checkpoint-only. A hot-swap would overwrite the live Yjs doc and
      // momentarily desync peers. v1 (collab=false) keeps the original
      // refetch-on-remote-snapshot behavior.
      if (collab) return;
      if (
        evt.createdBy &&
        lastSaveByUserRef.current &&
        evt.createdBy === lastSaveByUserRef.current
      ) {
        return;
      }
      void reloadFromLatest();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collab],
  );

  useDocumentRealtime(documentId, onRemoteSnapshot, { enabled: !collab });

  const reloadFromLatest = useCallback(async () => {
    if (!apiRef.current) return;
    const res = await getLatestDocumentSnapshot(documentId);
    if (isServiceFailure(res)) {
      toast({
        title: "Could not load latest document state",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    const snapshot = res.data?.snapshot;
    if (snapshot) {
      const fb = apiRef.current as unknown as {
        createUniverDoc?: (data: Partial<IDocumentData>) => unknown;
      };
      fb.createUniverDoc?.(
        sanitizeUniverDocSnapshot(
          snapshot as Partial<IDocumentData>,
          documentId,
        ),
      );
    }
  }, [documentId]);

  // Boot Univer EXACTLY ONCE per documentId. `editable` / `collab` are read
  // from refs (above) so toggling them never tears the instance down. This is
  // the lifecycle Univer's docs assume (create once, dispose on unmount) —
  // recreating on a prop change is what crashed Univer's ParagraphMenu popup
  // mid-render and made loaded content disappear.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { univer, univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: { [LocaleType.EN_US]: merge({}, docsCoreEnUS) },
          theme: defaultTheme,
          darkMode: darkModeRef.current,
          presets: [
            UniverDocsCorePreset({
              container: containerRef.current as HTMLElement,
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

        const res = await getLatestDocumentSnapshot(documentId);
        if (cancelled) return;
        if (isServiceFailure(res)) {
          setLoadError(res.error);
          setBootState("load_error");
          return;
        }
        const initial: Partial<IDocumentData> = sanitizeUniverDocSnapshot(
          (res.data?.snapshot as Partial<IDocumentData>) ??
            defaultEmptyDocument(),
          documentId,
        );
        const fb = apiRef.current as unknown as {
          createUniverDoc?: (data: Partial<IDocumentData>) => unknown;
        };
        fb.createUniverDoc?.(initial);
        setBootState("ready");

        // Command stream → debounced autosave. Registered for the lifetime of
        // the instance; viewer-mode (editable=false) is honored at fire time
        // via editableRef so a later edit-permission grant needs no remount.
        apiRef.current.onCommandExecuted(() => {
          if (!editableRef.current) return;
          setSaveStatus("dirty");
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            if (!editableRef.current) return;
            if (collabRef.current && !collabIsHostRef.current) return;
            void performSave();
          }, 2500);
        });

        if (collabRef.current) {
          void startCollabSession().catch((err) => {
            console.warn(
              "[document] collab boot failed — falling back to solo mode",
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
      collabSessionRef.current?.stop();
      collabSessionRef.current = null;
      const univer = univerRef.current;
      univerRef.current = null;
      apiRef.current = null;
      disposeUniverInstance(univer);
    };
    // performSave / startCollabSession are stable per documentId (useCallback
    // deps = [documentId]) and are declared below this effect, so they're
    // intentionally omitted to keep Univer booting exactly once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

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

    let commandService:
      | import("../collab/WorkbookCollabSession").CommandServiceLike
      | null = null;
    try {
      const injector = (
        univerRef.current as unknown as {
          __getInjector?: () => {
            get: <T>(token: unknown) => T | undefined;
          };
        }
      ).__getInjector?.();
      if (!injector) {
        console.warn("[document] collab: Univer injector unavailable");
        return;
      }
      const { ICommandService } = await import("@univerjs/core");
      const resolved = injector.get<
        import("../collab/WorkbookCollabSession").CommandServiceLike
      >(ICommandService as unknown);
      if (
        !resolved ||
        typeof resolved.onMutationExecutedForCollab !== "function"
      ) {
        console.warn(
          "[document] collab: ICommandService missing the onMutationExecutedForCollab hook",
        );
        return;
      }
      commandService = resolved;
    } catch (err) {
      console.warn("[document] collab: command-service resolution threw", err);
      return;
    }

    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const session = new WorkbookCollabSession({
      // The session takes an opaque resource id — we pass the documentId
      // through the `workbookId` field. The session itself never interprets
      // this value; it only forwards it to makeProvider.
      workbookId: documentId,
      uid,
      clientId,
      commandService,
      makeProvider: ({ workbookId: rid, clientId: cid, doc, awareness }) =>
        new SupabaseYjsProvider({
          workbookId: rid,
          // Distinct channel namespace — docs and workbooks never share a
          // broadcast room, even if their UUIDs accidentally collided.
          channelPrefix: "document",
          clientId: cid,
          doc,
          awareness,
        }),
      onAwarenessChange: (aw) => {
        setRemoteAwareness(
          new Map(
            aw.getStates() as Map<
              number,
              import("../collab/types").AwarenessState
            >,
          ),
        );
        const election = session.electHost();
        setCollabIsHost(election.isHost);
      },
    });

    collabSessionRef.current = session;
    await session.start();
  }, [documentId]);

  const performSave = useCallback(
    async (origin: "autosave" | "manual" = "autosave") => {
      if (!apiRef.current) return;
      const fb = apiRef.current as unknown as {
        getActiveDocument?: () => { getSnapshot(): IDocumentData } | null;
      };
      const doc = fb.getActiveDocument?.();
      if (!doc) return;
      const snapshot = doc.getSnapshot();
      setSaveStatus("saving");

      const { data: userData } = await supabase.auth.getUser();
      lastSaveByUserRef.current = userData?.user?.id ?? null;

      const res = await saveDocumentSnapshot({
        documentId,
        snapshot,
        origin,
      });
      if (isServiceFailure(res)) {
        setSaveStatus("error");
        toast({
          title: "Could not save document",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      setSaveStatus("saved");
      if (origin === "manual") {
        toast({ title: "Snapshot saved", variant: "success" });
      }
      setTimeout(
        () => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
        1500,
      );
    },
    [documentId],
  );

  const handleSaveNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave("manual");
  }, [performSave]);

  const statusPill = useMemo(() => statusPillFor(saveStatus), [saveStatus]);

  return (
    // Univer owns its own light/dark theming via the Facade API
    // (useUniverDarkModeSync), so we do NOT pin a colorScheme here — that fought
    // Univer's portals and broke dark mode. The wrapper bg uses a semantic
    // token so it adapts with the app theme during boot.
    <div className="matrx-univer-shell flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-xs min-w-0">
        {toolbarLeftSlot && (
          <div className="flex items-center gap-1 min-w-0 flex-1 pl-8 sm:pl-0">
            {toolbarLeftSlot}
          </div>
        )}
        {!toolbarLeftSlot && (
          <div className="text-muted-foreground flex-1 min-w-0 truncate">
            {bootState === "booting" && (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" />
                Loading document…
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
        <div className="flex items-center gap-1 shrink-0 pr-8">
          {collab && bootState === "ready" && (
            <RemoteCursorsLayer
              states={remoteAwareness}
              selfUid={collabSelfUid}
            />
          )}
          {bootState === "ready" && saveStatus !== "idle" && (
            <div
              className={`hidden sm:flex items-center gap-1 border border-green-500 ${statusPill.className}`}
            >
              {statusPill.icon}
              <span>{statusPill.text}</span>
            </div>
          )}
          {toolbarRightSlot}
          {bootState === "ready" && (
            <DocumentPageReferenceCopyButton
              documentId={documentId}
              documentName={documentName}
            />
          )}
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
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      <MatrxDynamicPanelHost
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="Document history"
        description="Every saved snapshot, newest first. Restore brings an older snapshot back as the new current state (the previous one stays in history)."
        position="right"
        defaultSize={32}
        contentClassName="overflow-y-auto"
      >
        <DocumentHistoryViewer documentId={documentId} editable={editable} />
      </MatrxDynamicPanelHost>
      {/* Hidden — documentName is reserved for the parent shell label. */}
      <span className="hidden">{documentName}</span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Univer's minimal empty document. Univer's dataStream encoding:
 *   \r  — paragraph break
 *   \n  — section break (must terminate the body)
 *
 * One empty paragraph + section break = a brand-new blank page.
 */
function defaultEmptyDocument(): Partial<IDocumentData> {
  return {
    id: cryptoRandomId(),
    locale: LocaleType.EN_US,
    title: "Untitled document",
    body: {
      dataStream: "\r\n",
      paragraphs: [{ startIndex: 0 }],
      sectionBreaks: [{ startIndex: 1 }],
    },
    documentStyle: {
      pageSize: { width: 595, height: 842 }, // A4 in points (72dpi)
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 90,
      marginRight: 90,
    },
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
