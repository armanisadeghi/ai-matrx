"use client";

/**
 * DocumentRecord — ONE document, with every control `/documents/[id]` offers
 * for it, as one shared component. Two consumers render it: the route
 * (`app/(core)/documents/[id]/page.tsx`, which adds only its RouteHeader and
 * back button) and the Board's Document tile (`features/board/items/
 * document-items.tsx`). Never a second copy.
 *
 * It owns the load, the edit gate, rename, Copy reference, Share, the
 * Rulebook notice, the Univer editor, and the `matrx-user/documents` agent
 * surface for this record (`SurfaceRuntimeProvider`). Where the title field
 * and the actions sit is the host's choice (`renderHeader`): the page puts them
 * in its RouteHeader, the tile in a strip above the editor.
 *
 * On the board every tile mounts this, and the board's `SurfaceActivity` keeps
 * all but the live tile dormant — so this registers its surface
 * unconditionally and never asks whether it is on a board.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { Input } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { useAppStore } from "@/lib/redux/hooks";
import { documentWorkingCopy } from "@/features/documents/document-model/documentModels";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { RichCopySplit } from "@/components/agent-copy/RichCopySplit";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { DocumentRulebookNotice } from "@/features/masterwork/components/DocumentRulebookNotice";
import { canActOn } from "@/features/access-gate/service/canActOn";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { captureDomSelection } from "@/features/context-menu-v3/utils/selection-tracking";

import {
  getDocument,
  renameDocument,
  updateDocumentDescription,
} from "@/features/documents/document-service";
import { isServiceFailure, type DocumentRow } from "@/features/data-tables/types";
import {
  buildDocumentContextData,
  DOCUMENTS_SURFACE_NAME,
} from "@/features/documents/agent-context/buildDocumentsContextData";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  validateDocumentDescription,
  validateDocumentName,
} from "@/features/documents/agent-context/documentWriteValidation";
import {
  bodyTextOf,
  documentBodyWriteHandler,
  type DocumentBodyPort,
} from "@/features/documents/document-body-text";

// Univer hard-depends on `window` / `document`. Mount client-only. This is the
// editor's one SSR boundary; the board reaches it statically from inside its
// own lazy edge, so it is never stacked under a second boundary.
const DocumentEditor = dynamic(() => import("@/features/documents/components/DocumentEditor"), {
  ssr: false,
  loading: () => <EditorBootSpinner />,
});

function EditorBootSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin mr-2" />
      Loading editor…
    </div>
  );
}

export interface DocumentRecordHeaderParts {
  /** The rename field (+ its saving spinner); null when the load failed. */
  title: ReactNode | null;
  /** Copy reference + Share; null until the row has loaded. */
  actions: ReactNode | null;
}

/** What the document's working copy keeps about it besides the body. */
interface DocumentRecordMeta {
  row: DocumentRow;
  userId: string | null;
  canEdit: boolean;
}

export interface DocumentRecordProps {
  documentId: string;
  /** Places the title field and the actions. Rendered above the body. */
  renderHeader: (parts: DocumentRecordHeaderParts) => ReactNode;
  /** Extra classes on the body frame (the page adds its header clearance). */
  bodyClassName?: string;
  /** Called with the row each time it loads or changes (a rename, an agent write). */
  onDocument?: (doc: DocumentRow) => void;
}

export function DocumentRecord({
  documentId: id,
  renderHeader,
  bodyClassName,
  onDocument,
}: DocumentRecordProps) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  // Editability must be RESOLVED before the editor mounts. Univer boots once
  // per documentId; if `editable` flips false→true after mount, the boot
  // effect tears down and recreates Univer, and disposing it mid-render
  // crashes Univer's React popups (ParagraphMenu) — content loads, then
  // vanishes. Gate the mount on this flag so `editable` is stable from frame 1.
  const [permsResolved, setPermsResolved] = useState(false);

  // The live document row, advanced SYNCHRONOUSLY as each write lands.
  // `applySurfaceWrite` resolves a target's handler BEFORE it awaits that
  // target's confirm dialog, so when an agent stages BOTH targets in one turn
  // every closure is captured up front — a handler reading `doc` off its render
  // closure would guard against a snapshot taken before the previous target
  // applied, and would report the pre-write name back to the agent. Rendering
  // still reads `doc`; only the write paths read this.
  const docRef = useRef<DocumentRow | null>(null);
  /** Same staleness argument as `docRef`, for the permission gate. */
  const canEditRef = useRef(false);
  /** The editor's body port (null until Univer has mounted the document). */
  const bodyPortRef = useRef<DocumentBodyPort | null>(null);
  const onDocumentRef = useRef(onDocument);
  useEffect(() => {
    onDocumentRef.current = onDocument;
  }, [onDocument]);

  // The row, the person and the edit gate are the document's metadata in the
  // one working copy (Redux `workingCopies["udt_document:<id>"].record`): read
  // once, kept for every view of the document, so a tile that wakes or remounts
  // reads none of it again.
  const store = useAppStore();
  const userIdRef = useRef<string | null>(null);
  const remember = () => {
    if (!docRef.current) return;
    const meta: DocumentRecordMeta = {
      // Redux freezes what it holds: it gets its own copy, never the object a
      // service handed back (that one stays the caller's).
      row: { ...docRef.current },
      userId: userIdRef.current,
      canEdit: canEditRef.current,
    };
    documentWorkingCopy.setRecord(id, meta);
  };

  /** The ONE place that advances the row — keeps state and the ref in step. */
  const commitDocument = (next: DocumentRow) => {
    docRef.current = next;
    setDoc(next);
    onDocumentRef.current?.(next);
    remember();
  };

  /** Same, for the edit gate. */
  const applyCanEdit = (next: boolean) => {
    canEditRef.current = next;
    setCanEdit(next);
    remember();
  };

  const lendBodyPort = (port: DocumentBodyPort | null) => {
    bodyPortRef.current = port;
  };

  useEffect(() => {
    let active = true;
    const release = documentWorkingCopy.attach(id, store);
    const cached = documentWorkingCopy.entry(id)?.record as DocumentRecordMeta | undefined;
    if (cached) {
      // Held in memory (another view, or this tile before it slept).
      docRef.current = cached.row;
      setDoc(cached.row);
      onDocumentRef.current?.(cached.row);
      setRenameDraft(cached.row.document_name);
      userIdRef.current = cached.userId;
      setCurrentUserId(cached.userId);
      canEditRef.current = cached.canEdit;
      setCanEdit(cached.canEdit);
      setPermsResolved(true);
      return () => {
        active = false;
        release();
      };
    }
    (async () => {
      const res = await getDocument(id);
      if (!active) return;
      if (isServiceFailure(res)) {
        setError(res.error);
        return;
      }
      commitDocument(res.data);
      setRenameDraft(res.data.document_name);

      const { data: userData } = await getClaimsUser(supabase);
      const userId = userData?.user?.id ?? null;
      userIdRef.current = userId;
      setCurrentUserId(userId);

      // Editor gate: owner ALWAYS edits; non-owner edits when the access kernel
      // (canActOn → iam.has_access) allows editor — the same question the write doors ask. Matches the workbook permission flow.
      if (userId && userId === res.data.user_id) {
        applyCanEdit(true);
      } else {
        applyCanEdit(await canActOn("udt_document", id, "editor"));
      }
      setPermsResolved(true);
    })();
    return () => {
      active = false;
      release();
    };
  }, [id, store]);

  const isOwner =
    doc !== null && currentUserId !== null && doc.user_id === currentUserId;

  const applyRename = async (name: string) => {
    const current = docRef.current;
    if (!current || name === current.document_name) return;
    setRenameSaving(true);
    const res = await renameDocument(id, name);
    setRenameSaving(false);
    if (isServiceFailure(res)) {
      setRenameDraft(current.document_name);
      throw new Error(res.error);
    }
    commitDocument(res.data);
    setRenameDraft(res.data.document_name);
  };

  const commitRename = () => {
    // The field has already reverted to the persisted name on failure, and a
    // blur is trivially retryable — swallow here so an unhandled rejection
    // never escapes the event handler. Agent writes go through the handler
    // below instead, where the throw becomes an error envelope the agent reads.
    void applyRename(renameDraft).catch(() => {});
  };

  // Write half of `matrx-user/documents` for ONE document. The name and the
  // description are the human-authored fields of the `udt_documents` row and
  // persist immediately through `document-service` — never a direct table
  // write. The BODY is Univer's: `document_body` changes it through the
  // editor's own command service (`../document-body-text.ts`), so the editor's
  // autosave, History, undo and collab carry it. Every handler validates then
  // THROWS on a bad shape, which the writeback seam turns into an error
  // envelope the agent reads. Fresh closures per call (getWriteHandlers
  // contract); every read of the row goes through the refs because the seam
  // resolves these closures before the first confirm resolves.
  const assertWritable = (whatItBlocks: string) => {
    if (!docRef.current)
      throw new Error("The document has not finished loading yet.");
    if (!canEditRef.current)
      throw new Error(
        `This document is open in viewer-only mode — the user does not have edit permission, so ${whatItBlocks}.`,
      );
  };

  const getSurfaceWriteHandlers = () => ({
    document_name: async (value: unknown) => {
      const next = validateDocumentName(value);
      assertWritable("it cannot be renamed");
      await applyRename(next);
    },
    document_description: async (value: unknown) => {
      const next = validateDocumentDescription(value);
      assertWritable("its description cannot be changed");
      const res = await updateDocumentDescription(id, next);
      if (isServiceFailure(res)) throw new Error(res.error);
      commitDocument(res.data);
    },
    document_body: documentBodyWriteHandler({
      getPort: () => bodyPortRef.current,
      assertWritable,
    }),
  });

  if (error) {
    return (
      <>
        {renderHeader({ title: null, actions: null })}
        {/* The service reports only a message (no PostgREST code), so the
            gate asks the platform which state this is — denied, deleted,
            missing, or signed out — rather than guessing from the text. */}
        <div className={cn("h-full overflow-hidden", bodyClassName)}>
          <AccessGate
            token="udt_document"
            id={id}
            fallbackHref="/documents"
            fallbackLabel="Back to documents"
          />
        </div>
      </>
    );
  }

  // ---- Agent-context surface (matrx-user/documents, document view) --------
  // Plain function (React Compiler memoizes; never useCallback) — read live
  // state at Run time, the body text straight from the live editor.
  const getDocumentScope = () => {
    const captured = captureDomSelection();
    const port = bodyPortRef.current;
    let bodyText: string | null = null;
    if (port) {
      try {
        bodyText = bodyTextOf(port.getDataStream()).text;
      } catch (err) {
        console.warn("[documents] could not read the document body", err);
      }
    }
    return buildApplicationScopeFromMenuContext({
      selectedText: captured.text,
      selectionRange: null,
      contextData: buildDocumentContextData({
        document: doc,
        canEdit,
        isOwner,
        bodyText,
      }),
    });
  };

  const title = (
    <>
      <Input
        value={renameDraft}
        onChange={(e) => setRenameDraft(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape" && doc) {
            setRenameDraft(doc.document_name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 max-w-[45vw] sm:max-w-xs"
        disabled={!doc || !canEdit}
        // Same bound the write handler enforces and the manifest quotes,
        // from the same module — the agent path and the human path
        // cannot disagree about how long a title may be. Without it the
        // field happily takes a pasted 300-character title, the blur
        // commit gets a 400 from `varchar(255)`, and `commitRename`
        // swallows it: the title reverts with nothing explaining why.
        maxLength={DOCUMENT_NAME_MAX_LENGTH}
        placeholder="Document name"
      />
      {renameSaving && (
        <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
      )}
    </>
  );

  const actions = doc ? (
    <div className="flex items-center gap-0.5">
      {/* Secondary action — hidden below sm so the rename field and
          the share control keep the whole mobile header budget. */}
      <RichCopySplit
        label={doc.document_name}
        size="sm"
        human={() => {
          const port = bodyPortRef.current;
          return port ? bodyTextOf(port.getDataStream()).text : "";
        }}
      />
      <span className="hidden sm:inline-flex">
        <ReferenceCopyButton
          referenceType="document"
          id={doc.id}
          label={doc.document_name}
          toastLabel={doc.document_name}
          size="sm"
        />
      </span>
      <ShareButton
        resourceType="udt_document"
        resourceId={doc.id}
        resourceName={doc.document_name}
        isOwner={isOwner}
        variant="ghost"
        size="sm"
      />
    </div>
  ) : null;

  return (
    <SurfaceRuntimeProvider
      surfaceName={DOCUMENTS_SURFACE_NAME}
      getScope={getDocumentScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable={canEdit}
    >
      {renderHeader({ title, actions })}
      {/* The editor owns a static status/action bar at its very top; the host
          decides the clearance above it (the page's glass header needs it). */}
      <div
        className={cn(
          "flex h-full w-full flex-col overflow-hidden",
          bodyClassName,
        )}
      >
        {/* WHAT IS THIS AND WHERE DOES WHAT I TYPE GO. A document reached from
            a Rulebook's "Add more" opens in a NEW TAB on a word processor with
            no context and no Back; the row says what the writing is for and
            offers the way home. It renders itself away when the document
            belongs to no Rulebook, so the ordinary visitor sees nothing. */}
        <DocumentRulebookNotice
          documentId={doc ? id : null}
          className="mx-2 mt-2 shrink-0"
        />
        {/* The editor is one control: Univer draws on a canvas, so a board
            tile (features/board) cannot tell a press in it from a press on
            empty body. `data-board-interactive` says so — a click places the
            caret instead of selecting the tile. No effect off the board. */}
        <div className="min-h-0 flex-1" data-board-interactive="">
          {permsResolved && doc ? (
            <DocumentEditor
              documentId={id}
              documentName={doc.document_name}
              editable={canEdit}
              collab
              onBodyPort={lendBodyPort}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading document…
            </div>
          )}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
