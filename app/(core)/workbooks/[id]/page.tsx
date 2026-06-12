"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { ShareButton } from "@/features/sharing/components/ShareButton";

import {
  getWorkbook,
  renameWorkbook,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";

// Univer hard-depends on `window` / `document`. Mount client-only.
const WorkbookEditor = dynamic(
  () => import("@/features/data-tables/components/WorkbookEditor"),
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

export default function WorkbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getWorkbook(id);
      if (isServiceFailure(res)) {
        setError(res.error);
        return;
      }
      setWorkbook(res.data);
      setRenameDraft(res.data.workbook_name);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      setCurrentUserId(userId);

      // Editor gate: owner ALWAYS edits; non-owner edits when has_permission
      // returns true for level=editor. has_permission is the source of truth
      // for sharing, so the UI matches what the RLS-protected RPCs will accept.
      if (userId && userId === res.data.user_id) {
        setCanEdit(true);
      } else {
        const { data: perm } = await supabase.rpc("has_permission", {
          p_resource_type: "udt_workbooks",
          p_resource_id: id,
          p_required_permission: "editor",
        });
        setCanEdit(perm === true);
      }
    })();
  }, [id]);

  const isOwner =
    workbook !== null &&
    currentUserId !== null &&
    workbook.user_id === currentUserId;

  const commitRename = async () => {
    if (!workbook || renameDraft === workbook.workbook_name) return;
    setRenameSaving(true);
    const res = await renameWorkbook(id, renameDraft);
    setRenameSaving(false);
    if (!isServiceFailure(res)) {
      setWorkbook(res.data);
    } else {
      setRenameDraft(workbook.workbook_name);
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <div className="text-destructive">Could not load workbook.</div>
        <div className="text-muted-foreground">{error}</div>
        <Button variant="outline" size="sm" asChild>
          <a href="/workbooks">Back to workbooks</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-page w-full flex-col p-3">
      <div className="flex items-center gap-2 pb-2">
        <Button variant="ghost" size="icon" asChild>
          <a href="/workbooks" aria-label="Back to workbooks">
            <ArrowLeft className="size-4" />
          </a>
        </Button>
        <Input
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape" && workbook) {
              setRenameDraft(workbook.workbook_name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 max-w-md text-base font-semibold"
          disabled={!workbook || !canEdit}
          placeholder="Workbook name"
        />
        {renameSaving && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
        <div className="ml-auto">
          {workbook && (
            <ShareButton
              resourceType="udt_workbooks"
              resourceId={workbook.id}
              resourceName={workbook.workbook_name}
              isOwner={isOwner}
              variant="outline"
              size="sm"
            />
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <WorkbookEditor
          workbookId={id}
          workbookName={workbook?.workbook_name ?? undefined}
          editable={canEdit}
          collab
        />
      </div>
    </div>
  );
}
