"use client";

import { useEffect, useRef, useState, use } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

import {
  getDocument,
  renameDocument,
  updateDocumentDescription,
} from "@/features/data-tables/document-service";
import {
  isServiceFailure,
  type DocumentRow,
} from "@/features/data-tables/types";
import {
  buildDocumentContextData,
  DOCUMENTS_SURFACE_NAME,
} from "@/features/data-tables/agent-context/buildDocumentsContextData";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  validateDocumentDescription,
  validateDocumentName,
} from "@/features/data-tables/agent-context/documentWriteValidation";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { captureDomSelection } from "@/features/context-menu-v3/utils/selection-tracking";

// Univer hard-depends on `window` / `document`. Mount client-only.
const DocumentEditor = dynamic(
  () => import("@/features/data-tables/components/DocumentEditor"),
  { ssr: false, loading: () => <EditorBootSpinner /> },
);

function EditorBootSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin mr-2" />
      Loading editor…
    </div>
  );
}

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

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

  /** The ONE place that advances the row — keeps state and the ref in step. */
  const commitDocument = (next: DocumentRow) => {
    docRef.current = next;
    setDoc(next);
  };

  /** Same, for the edit gate. */
  const applyCanEdit = (next: boolean) => {
    canEditRef.current = next;
    setCanEdit(next);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getDocument(id);
      if (!active) return;
      if (isServiceFailure(res)) {
        setError(res.error);
        return;
      }
      commitDocument(res.data);
      setRenameDraft(res.data.document_name);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      setCurrentUserId(userId);

      // Editor gate: owner ALWAYS edits; non-owner edits when has_permission
      // returns true for level=editor. Matches the workbook permission flow.
      if (userId && userId === res.data.user_id) {
        applyCanEdit(true);
      } else {
        const { data: perm } = await supabase.rpc("has_permission", {
          p_resource_type: "udt_document",
          p_resource_id: id,
          p_required_permission: "editor",
        });
        applyCanEdit(perm === true);
      }
      setPermsResolved(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

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

  // Write half of `matrx-user/documents` for the DOCUMENT route. Both targets
  // are the human-authored fields of the `udt_documents` row; the library route
  // registers nothing at all, and the document BODY belongs to Univer and is
  // not declared (see the manifest's `writeTargets` doc block for the per-mount
  // and ruled-out rationale). Both persist immediately through
  // `document-service` — never a direct table write — and both validate then
  // THROW on a bad shape, which the writeback seam turns into an error envelope
  // the agent reads. Fresh closures per call (getWriteHandlers contract), and
  // every read of the row goes through `docRef` because the seam resolves these
  // closures before the first confirm resolves.
  //
  // Shape validation lives in the PURE `documentWriteValidation` module rather
  // than inline here: it keeps the bounds in one place (the manifest
  // interpolates the same constants into the prose the model reads) and it
  // throws SYNCHRONOUSLY, before any state is touched, so a bad shape can never
  // half-apply.
  const assertWritable = (whatItBlocks: string) => {
    // `canEdit` goes through the ref for the same reason `doc` does — the seam
    // resolves these closures before the first confirm returns, so a render
    // snapshot can be stale by the time the user clicks Apply.
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
  });

  if (error) {
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/documents" ariaLabel="Back" />}
        />
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
          <div className="text-destructive">Could not load document.</div>
          <div className="text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" asChild>
            <a href="/documents">Back to documents</a>
          </Button>
        </div>
      </>
    );
  }

  // ---- Agent-context surface (matrx-user/documents, document view) --------
  // Plain function (React Compiler memoizes; never useCallback) — read live
  // state at Run time. The Univer editor owns the body text, so it is
  // deliberately not part of the emitted scope (see the manifest header).
  const getDocumentScope = () => {
    const captured = captureDomSelection();
    return buildApplicationScopeFromMenuContext({
      selectedText: captured.text,
      selectionRange: null,
      contextData: buildDocumentContextData({
        document: doc,
        canEdit,
        isOwner,
      }),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={DOCUMENTS_SURFACE_NAME}
      getScope={getDocumentScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable={canEdit}
    >
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/documents" ariaLabel="Back" />
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
              className="h-7 min-w-0 max-w-[45vw] sm:max-w-xs text-sm font-medium border-0 bg-transparent shadow-none focus-visible:ring-1 px-1.5"
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
        }
        right={
          doc ? (
            <div className="flex items-center gap-0.5">
              {/* Secondary action — hidden below sm so the rename field and
                  the share control keep the whole mobile header budget. */}
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
          ) : undefined
        }
      />
      {/* The editor owns a static status/action bar at its very top, so the
          body takes header clearance instead of scrolling behind the glass —
          without it that row (and Save / History) sits under the shell header
          and collides with the avatar. */}
      <div className="h-full w-full overflow-hidden pt-[var(--shell-header-h)]">
        {permsResolved && doc ? (
          <DocumentEditor
            documentId={id}
            documentName={doc.document_name}
            editable={canEdit}
            collab
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            Loading document…
          </div>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
