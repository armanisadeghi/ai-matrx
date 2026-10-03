/**
 * DocumentEditor — mounts Univer (preset-docs-core) as ONE VIEW of a document.
 *
 * The document itself is the tab's one in-memory model for this id
 * (`../document-model/documentModel.ts`), not this component:
 *   - Load: a view boots from the model's latest state — another live view of
 *     the same document, or what the last view left behind — and only reads
 *     the newest server snapshot when this tab holds none.
 *   - Edits: every local mutation is replayed into every other view of the
 *     document, so two views (a board tile and the document's page, two
 *     tiles) show one document.
 *   - Save: ONE coalesced save per document (2.5s after the last edit; a new
 *     row in `udt_document_snapshots`, append-only), flushed when the last view
 *     leaves, on page hide and on Save. Status is shared (Redux
 *     `documentSessions`).
 *   - Realtime / collab: the snapshot channel and the Yjs room are opened once
 *     per document by the model, never once per view.
 * A remount (a board tile waking, a removed tile undone, Back and forward)
 * therefore never rebuilds from a stale server copy and never saves twice.
 *
 * SSR: this is "use client". The page that renders it should use dynamic
 * import with `ssr: false` so Univer never executes server-side.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Save } from "lucide-react";

import {
  createUniver,
  LocaleType,
  merge,
  type FUniver,
} from "@univerjs/presets";
import {
  createParagraphId,
  createSectionId,
  ICommandService,
  type IDocumentData,
  type Univer,
} from "@univerjs/core";
import { defaultTheme } from "@univerjs/themes";
import { UniverDocsCorePreset } from "@univerjs/preset-docs-core";
import docsCoreEnUS from "@univerjs/preset-docs-core/locales/en-US";
import {
  DragManagerService,
  HoverManagerService,
} from "@univerjs/preset-sheets-core";
import "@univerjs/preset-docs-core/lib/index.css";
import { useRealtimeManager } from "@ai-matrx/realtime/react";

import { supabase } from "@/utils/supabase/client";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToolToggle } from "@/features/canvas/host/toolCanvas";
import { toast } from "@/components/ui/use-toast";

import { defaultDocumentPageStyle } from "../document-page-style";
import {
  renderDocumentCanvasColorsVerbatim,
  type ReplaceableInjector,
} from "../univer-doc-canvas-colors";
import { mountUniverDocument } from "../univer-mount-document";
import { useUniverDarkModeSync } from "../hooks/useUniverDarkModeSync";
import { useUniverDocSurfaceTheme } from "../hooks/useUniverDocSurfaceTheme";
import { sanitizeUniverDocSnapshot } from "../utils/sanitizeUniverDocSnapshot";
import { disposeUniverInstance } from "../utils/disposeUniverInstance";
import { registerUniverFacadeDependencies } from "../utils/registerUniverFacadeDependencies";
import { RemoteCursorsLayer } from "./RemoteCursorsLayer";
import { documentHistoryToggleInput } from "../canvas/historyKinds";
import { DocumentPageReferenceCopyButton } from "./DocumentPageReferenceCopyButton";
import type { DocumentBodyPort } from "../document-body-text";
import {
  selectDocumentSaveStatus,
  type DocumentSaveStatus,
} from "../redux/documentSessionsSlice";
import {
  acquireDocumentModel,
  connectDocumentRealtime,
} from "../document-model/documentModels";
import type {
  DocumentAwareness,
  DocumentCollabFactory,
} from "../document-model/documentModel";
import type { CommandServiceLike } from "../collab/WorkbookCollabSession";
import type { AwarenessState } from "../collab/types";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Props = {
  documentId: string;
  /** Pass false to mount in viewer-only mode (no autosave). */
  editable?: boolean;
  /** Used as the document display name on export / shell. Falls back to documentId. */
  documentName?: string;
  /**
   * Opt in to v2 CRDT collab — see `features/data-tables/collab/FEATURE.md`.
   * The document's model joins ONE Yjs room per document (channel prefix
   * "document", so docs and workbooks never share a room) and binds it to the
   * model's command stream, so every view of the document in this tab is in
   * the room through it.
   */
  collab?: boolean;
  /**
   * Lends the body text to the record's agent surface (`document_body_text`
   * and the `document_body` write target, `../document-body-text.ts`): called
   * with a port once Univer has mounted the document, and with null when the
   * instance is torn down. Every call through the port resolves the LIVE
   * document, and every write runs through Univer's command service, so undo,
   * autosave, History, every other view and collab see an agent's edit
   * exactly as a keystroke.
   */
  onBodyPort?: (port: DocumentBodyPort | null) => void;
};

export default function DocumentEditor({
  documentId,
  editable = true,
  documentName,
  collab = false,
  onBodyPort,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<FUniver | null>(null);
  const univerRef = useRef<Univer | null>(null);
  /** The document's model while this view holds it (save, status, rooms). */
  const modelRef = useRef<ReturnType<typeof acquireDocumentModel>["model"] | null>(null);
  const realtimeManager = useRealtimeManager();
  const realtimeManagerRef = useRef(realtimeManager);
  useEffect(() => {
    realtimeManagerRef.current = realtimeManager;
  }, [realtimeManager]);
  const [awareness, setAwareness] = useState<DocumentAwareness | null>(null);

  const [bootState, setBootState] = useState<
    "booting" | "ready" | "load_error"
  >("booting");
  /**
   * Univer's UNIT id for the open document — the snapshot's own `id`, which is
   * NOT `documentId` (a new document gets a fresh uuid; a loaded one keeps the
   * id its snapshot was stored with). The theme sync addresses the render by
   * unit, so it needs this rather than the row id.
   */
  const [unitId, setUnitId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // ONE status per document, whichever view wrote it.
  const saveStatus: DocumentSaveStatus =
    useAppSelector(selectDocumentSaveStatus(documentId)) ?? "idle";
  // Snapshot history is a canvas tab beside the editor; the button toggles it.
  const snapshotHistory = useToolToggle(documentHistoryToggleInput(documentId, editable));

  // Univer boots ONCE per documentId (see boot effect). `editable` and
  // `collab` can change AFTER boot, so the model reads them through refs —
  // recreating Univer on a prop toggle is what made content load then vanish
  // (disposing Univer mid-render crashes its popups).
  const editableRef = useRef(editable);
  const collabRef = useRef(collab);
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);
  useEffect(() => {
    collabRef.current = collab;
  }, [collab]);

  // Initial dark-mode value for createUniver. Live changes are handled by
  // useUniverDarkModeSync below; this just avoids a light→dark flash on boot.
  const themeMode = useThemeMode();
  const darkModeRef = useRef(themeMode === "dark");
  useEffect(() => {
    darkModeRef.current = themeMode === "dark";
  }, [themeMode]);

  // The body port — published while a document is mounted, withdrawn on
  // teardown. Resolved per call so it never holds a disposed instance.
  const bodyReady = bootState === "ready" && unitId !== null;
  useEffect(() => {
    if (!onBodyPort || !bodyReady) return undefined;
    const liveDocument = () => {
      const doc = apiRef.current?.getActiveDocument();
      if (!doc) {
        throw new Error(
          "The document editor is closed or still opening. Nothing was changed; open the document and try again.",
        );
      }
      return doc;
    };
    onBodyPort({
      getDataStream: () => liveDocument().getBody().dataStream,
      deleteRange: (start, end) =>
        liveDocument().deleteRange({ startOffset: start, endOffset: end }),
      insertText: (at, text) => liveDocument().insertText(at, text),
    });
    return () => onBodyPort(null);
  }, [onBodyPort, bodyReady]);

  // Keep Univer's dark mode in lockstep with the app theme (Facade API).
  // This reaches Univer's CHROME only — see the hook's header.
  useUniverDarkModeSync(apiRef, bootState === "ready");

  // …and the page itself, which Univer paints from hardcoded LIGHT constants
  // no theme ever reaches. Without this the document renders as a page in the
  // wrong theme inside a frame in the wrong theme (cold walk 18: a black sheet
  // in a white frame, in a dark app). Every Matrx surface that shows a cloud
  // document mounts THIS component, so they all inherit the fix.
  useUniverDocSurfaceTheme(
    univerRef,
    unitId ?? "",
    bootState === "ready" && unitId !== null,
  );

  // Boot Univer EXACTLY ONCE per documentId and attach it to the document's
  // model. `editable` / `collab` are read from refs (above) so toggling them
  // never tears the instance down. This is the lifecycle Univer's docs assume
  // (create once, dispose on unmount) — recreating on a prop change is what
  // crashed Univer's ParagraphMenu popup mid-render and made loaded content
  // disappear.
  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    const { model, release } = acquireDocumentModel(documentId);
    modelRef.current = model;
    const manager = realtimeManagerRef.current;
    if (manager && !collabRef.current) connectDocumentRealtime(model, manager);
    let detach: (() => void) | null = null;
    const stopAwareness = model.subscribeAwareness(() =>
      setAwareness(model.getAwareness()),
    );

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

        // THE CANVAS PAINTS WHAT IT IS TOLD. Univer's dark mode otherwise
        // inverts every fill on its way to the context and THROWS on a colour
        // its ColorKit cannot parse — inside the render pass, which leaves the
        // whole page unpainted (cold walk 19). Must happen before the document
        // unit exists: `ICanvasColorService` is injected into that unit's
        // `Engine` at creation. Full argument in `../univer-doc-canvas-colors`.
        const verbatim = renderDocumentCanvasColorsVerbatim(
          univer.__getInjector() as unknown as ReplaceableInjector,
        );
        if (!verbatim.applied) {
          // NOTHING FAILS SILENTLY: the page is about to be painted by the
          // inverting service, which is the defect this guards.
          console.warn(
            `[document] could not take Univer's dark-mode colour inversion off the canvas (${verbatim.reason}) — the page may render inverted or blank in dark mode`,
          );
        }

        // Sheets Facade mixins are process-global. Once their module exists in
        // this SPA, FUniver attaches the observer to every later instance and
        // resolves these two services when *any* unit reaches Rendered. Sheet
        // plugins are lazy by unit type, so a document-only injector never
        // receives them from UniverSheetsUIPlugin. Register exactly what that
        // observer requires; starting the full sheets plugin creates workbook
        // UI and duplicate internal editor documents on this surface.
        registerUniverFacadeDependencies(univer.__getInjector(), [
          HoverManagerService,
          DragManagerService,
        ]);

        // The model's latest state, never a stale server copy while this tab
        // holds the document; re-read synchronously after the await, because
        // another view may have typed while the read was in flight.
        const opening = await model.openingSnapshot(defaultEmptyDocument);
        if (cancelled) return;
        const initial: Partial<IDocumentData> = sanitizeUniverDocSnapshot(
          (model.latest() ?? opening) as Partial<IDocumentData>,
          documentId,
        );
        // Univer is the authority on what it actually mounted (the snapshot
        // may have been repaired); a unit that did not mount throws into the
        // catch below and the page says "Load failed" — never "Editing".
        setUnitId(mountUniverDocument(univerAPI, initial));

        detach = model.attachView({
          commandService: resolveCommandService(univer),
          snapshot: () => apiRef.current?.getActiveDocument()?.save() ?? null,
          remount: (snapshot) => {
            if (!apiRef.current) return;
            mountUniverDocument(
              apiRef.current,
              sanitizeUniverDocSnapshot(snapshot as Partial<IDocumentData>, documentId),
            );
          },
          editable: () => editableRef.current,
        });
        setBootState("ready");

        if (collabRef.current) {
          void model.startCollab(collabFactoryFor(documentId)).catch((err) => {
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
      // The unit belongs to the instance being torn down — never let the next
      // document's theme sync address the previous document's render.
      setUnitId(null);
      stopAwareness();
      // LEAVING IS NOT A REASON TO LOSE THE LAST SENTENCE. Detaching hands
      // this view's document to the model synchronously (before Univer is
      // disposed below); releasing the last hold flushes the one pending save,
      // and a view that comes back before it lands boots from that same state.
      detach?.();
      release();
      modelRef.current = null;
      const univer = univerRef.current;
      univerRef.current = null;
      apiRef.current = null;
      disposeUniverInstance(univer);
    };
  }, [documentId]);

  const handleSaveNow = () => {
    const model = modelRef.current;
    if (!model) {
      // NOTHING FAILS SILENTLY: a Save that cannot reach the document says so
      // with the one remedy that keeps the words (cold walk 8, 2026-09-17).
      toast({
        title: "This document cannot be saved right now",
        description:
          "Your text is still on screen — copy it somewhere safe, then reload this page to reconnect the editor.",
        variant: "destructive",
      });
      return;
    }
    void model.saveNow();
  };

  const statusPill = useMemo(() => statusPillFor(saveStatus), [saveStatus]);

  return (
    // Univer owns its own light/dark theming via the Facade API
    // (useUniverDarkModeSync), so we do NOT pin a colorScheme here — that fought
    // Univer's portals and broke dark mode. The wrapper bg uses a semantic
    // token so it adapts with the app theme during boot.
    <div className="matrx-univer-shell flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-xs min-w-0">
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
              <ErrorAlchemyMenu error={loadError} />
            </span>
          )}
          {bootState === "ready" && (
            <span>{editable ? "Editing" : "Viewing"}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {collab && bootState === "ready" && awareness && (
            <RemoteCursorsLayer
              states={awareness.states}
              selfUid={awareness.selfUid}
            />
          )}
          {bootState === "ready" && saveStatus !== "idle" && (
            /* Save state is the one thing on this bar a person must be able
               to trust, so it is not hidden on a phone and it no longer wears
               a hardcoded green border while saying "Unsaved changes" in
               amber. */
            <div className={`flex items-center gap-1 ${statusPill.className}`}>
              {statusPill.icon}
              <span>{statusPill.text}</span>
            </div>
          )}
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
            className={cn("h-7 gap-1 px-2 text-xs", snapshotHistory.isVisible && "bg-accent text-accent-foreground")}
            onClick={snapshotHistory.toggle}
            aria-pressed={snapshotHistory.isVisible}
            title="View snapshot history"
          >
            <History className="size-3" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {/* Hidden — documentName is reserved for the parent shell label. */}
      <span className="hidden">{documentName}</span>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Univer's command service for one instance — what the model listens to and replays into. */
function resolveCommandService(univer: Univer): CommandServiceLike {
  const injector = (
    univer as unknown as {
      __getInjector?: () => { get: <T>(token: unknown) => T | undefined };
    }
  ).__getInjector?.();
  const resolved = injector?.get<CommandServiceLike>(ICommandService as unknown);
  if (
    !resolved ||
    typeof resolved.onMutationExecutedForCollab !== "function" ||
    typeof resolved.syncExecuteCommand !== "function"
  ) {
    // A view the model cannot hear would type into a copy nobody saves.
    throw new Error(
      "The editor could not connect to this document's change stream (Univer command service unavailable).",
    );
  }
  return resolved;
}

/**
 * The document's ONE collab room, bound to the model's command stream (so
 * every view in this tab is in the room through it). Lazy-imports yjs so
 * non-collab documents never load it.
 */
function collabFactoryFor(documentId: string): DocumentCollabFactory {
  return async (commandService, onAwareness) => {
    const { data: userData } = await getClaimsUser(supabase);
    const uid = userData?.user?.id;
    if (!uid) return null;
    const [{ WorkbookCollabSession }, { SupabaseYjsProvider }] = await Promise.all([
      import("../collab/WorkbookCollabSession"),
      import("../collab/SupabaseYjsProvider"),
    ]);
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let host = true; // solo = host
    const session = new WorkbookCollabSession({
      // The session takes an opaque resource id — the documentId rides the
      // `workbookId` field; the session only forwards it to makeProvider.
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
        host = session.electHost().isHost;
        onAwareness({
          states: new Map(aw.getStates() as Map<number, AwarenessState>),
          selfUid: uid,
        });
      },
    });
    await session.start();
    return { stop: () => session.stop(), isHost: () => host };
  };
}

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
      paragraphs: [
        { startIndex: 0, paragraphId: createParagraphId(new Set()) },
      ],
      sectionBreaks: [{ startIndex: 1, sectionId: createSectionId(new Set()) }],
    },
    documentStyle: defaultDocumentPageStyle(),
  };
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function statusPillFor(s: DocumentSaveStatus): {
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
