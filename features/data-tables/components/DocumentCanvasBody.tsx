"use client";

/**
 * DocumentCanvasBody — a cloud document (`workbench.udt_documents`) rendered
 * INSIDE the canvas pane, bare.
 *
 * The canvas is a HOST, not a second editor: this mounts the canonical
 * `DocumentEditor` (the very component `/documents/[id]` mounts) and adds no
 * editor of its own. `CanvasPane` supplies the frame, the title and the
 * Preview/Source switcher, so this body draws no chrome.
 *
 * Why it exists (production defect, 2026-09-14): the chat agent created a
 * document and announced «Created and opened as a document artifact».
 * Nothing opened, and nothing could have — the canvas had no content type
 * that could host a `udt_document` at all.
 *
 * Nothing here ever ends in a blank pane. A row that cannot be read, a
 * document that was deleted, an id that no longer resolves: each says what
 * happened and offers the real remedy (`/documents/[id]`), never a spinner
 * that will not resolve.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";

import { supabase } from "@/utils/supabase/client";
import { getDocument } from "@/features/data-tables/document-service";
import { isServiceFailure, type DocumentRow } from "@/features/data-tables/types";
import { cn } from "@/lib/utils";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
// Univer hard-depends on `window` / `document`, and it is a heavy chunk — keep
// it out of the canvas base bundle until a document pane actually opens.
const DocumentEditor = dynamic(
  () => import("@/features/data-tables/components/DocumentEditor"),
  { ssr: false, loading: () => <BootSpinner /> },
);

function BootSpinner() {
  return (
    <div
      className="flex h-full items-center justify-center text-xs text-muted-foreground"
      role="status"
    >
      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
      Loading document…
    </div>
  );
}

function DocumentUnavailable({
  documentId,
  reason,
}: {
  documentId: string;
  reason: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">
            This document couldn&apos;t be opened here
          </p>
          <p className="mt-1 text-xs">{reason}</p>
        </div>
        <a
          href={`/documents/${documentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline underline-offset-2"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Open it on its own page
        </a>
      </div>
    </div>
  );
}

export function DocumentCanvasBody({
  documentId,
  fallbackTitle,
  className,
}: {
  documentId: string;
  /** Name latched by the opener, so the pane can name the doc before it loads. */
  fallbackTitle?: string | null;
  className?: string;
}) {
  const [row, setRow] = useState<DocumentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Editability must be RESOLVED before Univer mounts: it boots once per
  // documentId, and flipping `editable` after mount tears it down mid-render
  // (content loads, then vanishes). Same gate the /documents/[id] route uses.
  const [canEdit, setCanEdit] = useState(false);
  const [permsResolved, setPermsResolved] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setPermsResolved(false);
    const res = await getDocument(documentId);
    if (isServiceFailure(res)) {
      setError(res.error);
      return;
    }
    setRow(res.data);

    const { data: userData } = await getClaimsUser(supabase);
    const userId = userData?.user?.id ?? null;
    if (userId && userId === res.data.user_id) {
      setCanEdit(true);
    } else {
      const { data: perm } = await supabase.rpc("has_permission", {
        p_resource_type: "udt_document",
        p_resource_id: documentId,
        p_required_permission: "editor",
      });
      setCanEdit(perm === true);
    }
    setPermsResolved(true);
  }, [documentId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (!documentId) {
    return (
      <DocumentUnavailable
        documentId=""
        reason="The pane was opened without a document id, so there is nothing to load."
      />
    );
  }

  if (error) {
    return <DocumentUnavailable documentId={documentId} reason={error} />;
  }

  if (!row || !permsResolved) return <BootSpinner />;

  return (
    <div className={cn("h-full min-h-0", className)}>
      <DocumentEditor
        documentId={documentId}
        editable={canEdit}
        documentName={row.document_name || fallbackTitle || "Document"}
      />
    </div>
  );
}

export default DocumentCanvasBody;
