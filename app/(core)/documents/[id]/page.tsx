"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { ShareButton } from "@/features/sharing/components/ShareButton";

import {
  getDocument,
  renameDocument,
} from "@/features/data-tables/document-service";
import {
  isServiceFailure,
  type DocumentRow,
} from "@/features/data-tables/types";

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

  useEffect(() => {
    (async () => {
      const res = await getDocument(id);
      if (isServiceFailure(res)) {
        setError(res.error);
        return;
      }
      setDoc(res.data);
      setRenameDraft(res.data.document_name);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      setCurrentUserId(userId);

      // Editor gate: owner ALWAYS edits; non-owner edits when has_permission
      // returns true for level=editor. Matches the workbook permission flow.
      if (userId && userId === res.data.user_id) {
        setCanEdit(true);
      } else {
        const { data: perm } = await supabase.rpc("has_permission", {
          p_resource_type: "udt_documents",
          p_resource_id: id,
          p_required_permission: "editor",
        });
        setCanEdit(perm === true);
      }
    })();
  }, [id]);

  const isOwner =
    doc !== null &&
    currentUserId !== null &&
    doc.user_id === currentUserId;

  const commitRename = async () => {
    if (!doc || renameDraft === doc.document_name) return;
    setRenameSaving(true);
    const res = await renameDocument(id, renameDraft);
    setRenameSaving(false);
    if (!isServiceFailure(res)) {
      setDoc(res.data);
    } else {
      setRenameDraft(doc.document_name);
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <div className="text-destructive">Could not load document.</div>
        <div className="text-muted-foreground">{error}</div>
        <Button variant="outline" size="sm" asChild>
          <a href="/documents">Back to documents</a>
        </Button>
      </div>
    );
  }

  // Title + share ride inside the editor's own toolbar — single row top,
  // no wasted vertical space. Mobile: no padding. Desktop: pr-12 clears
  // the global avatar.
  const titleSlot = (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
        <a href="/documents" aria-label="Back to documents">
          <ArrowLeft className="size-4" />
        </a>
      </Button>
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
        className="h-7 min-w-0 max-w-xs text-sm font-semibold border-0 bg-transparent shadow-none focus-visible:ring-1 px-1"
        disabled={!doc || !canEdit}
        placeholder="Document name"
      />
      {renameSaving && (
        <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
      )}
    </>
  );
  const shareSlot = doc ? (
    <ShareButton
      resourceType="udt_documents"
      resourceId={doc.id}
      resourceName={doc.document_name}
      isOwner={isOwner}
      variant="ghost"
      size="sm"
    />
  ) : null;

  return (
    <div className="flex h-page w-full flex-col p-0 sm:p-3 sm:pr-12">
      <div className="min-h-0 flex-1 overflow-hidden sm:rounded-md sm:border sm:border-border">
        <DocumentEditor
          documentId={id}
          documentName={doc?.document_name ?? undefined}
          editable={canEdit}
          collab
          toolbarLeftSlot={titleSlot}
          toolbarRightSlot={shareSlot}
        />
      </div>
    </div>
  );
}
