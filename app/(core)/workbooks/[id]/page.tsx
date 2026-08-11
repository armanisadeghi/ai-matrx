"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createWorkbooksScope } from "@/features/surfaces/manifests/workbooks.manifest";
import { readWorkbookScopeSource } from "@/features/data-tables/workbook-scope-source";
import {
  getWorkbook,
  renameWorkbook,
  updateWorkbookDescription,
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
  // Editability must be RESOLVED before the editor mounts. Univer boots once
  // per workbookId; if `editable` flips false→true after mount, the boot
  // effect tears down and recreates Univer, and disposing it mid-render
  // crashes Univer's React popups — content loads, then vanishes. Gate the
  // mount on this flag so `editable` is stable from the first frame.
  const [permsResolved, setPermsResolved] = useState(false);

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
          p_resource_type: "workbook",
          p_resource_id: id,
          p_required_permission: "editor",
        });
        setCanEdit(perm === true);
      }
      setPermsResolved(true);
    })();
  }, [id]);

  const isOwner =
    workbook !== null &&
    currentUserId !== null &&
    workbook.user_id === currentUserId;

  // The ONE rename path. The header field's blur/Enter commit and the
  // `workbook_name` write target both land here, so an agent-originated
  // rename is indistinguishable from the user typing it — same service call,
  // same optimistic state, same revert on failure.
  const applyRename = async (name: string) => {
    if (!workbook || name === workbook.workbook_name) return;
    setRenameSaving(true);
    const res = await renameWorkbook(id, name);
    setRenameSaving(false);
    if (isServiceFailure(res)) {
      setRenameDraft(workbook.workbook_name);
      throw new Error(res.error);
    }
    setWorkbook(res.data);
    setRenameDraft(res.data.workbook_name);
  };

  const commitRename = () => {
    // The field has already reverted to the persisted name on failure, and a
    // blur is trivially retryable — swallow here so an unhandled rejection
    // never escapes the event handler. Agent writes go through the handler
    // below instead, where the throw becomes an error envelope the agent reads.
    void applyRename(renameDraft).catch(() => {});
  };

  // Write half of `matrx-user/workbooks` for the EDITOR route. Only the two
  // human-authored fields of the workbook row are wired here; the sheet-name
  // target belongs to `WorkbookEditor`, which owns the Univer instance, and
  // the library route registers nothing at all (see the manifest's
  // `writeTargets` doc block for the per-mount rationale). Both persist
  // immediately through `workbook-service` — never a direct table write — and
  // both validate then THROW on a bad shape, which the writeback seam turns
  // into an error envelope the agent reads. Fresh closures per call
  // (getWriteHandlers contract).
  const getSurfaceWriteHandlers = () => ({
    workbook_name: async (value: unknown) => {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > 200
      )
        throw new Error(
          "workbook_name expects a non-empty string of at most 200 characters.",
        );
      if (!workbook)
        throw new Error("The workbook has not finished loading yet.");
      if (!canEdit)
        throw new Error(
          "This workbook is open in viewer-only mode — the user does not have edit permission, so it cannot be renamed.",
        );
      await applyRename(value.trim());
    },
    workbook_description: async (value: unknown) => {
      if (typeof value !== "string" || value.length > 2000)
        throw new Error(
          "workbook_description expects a string of at most 2000 characters.",
        );
      if (!workbook)
        throw new Error("The workbook has not finished loading yet.");
      if (!canEdit)
        throw new Error(
          "This workbook is open in viewer-only mode — the user does not have edit permission, so its description cannot be changed.",
        );
      const res = await updateWorkbookDescription(id, value);
      if (isServiceFailure(res)) throw new Error(res.error);
      setWorkbook(res.data);
    },
  });

  if (error) {
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/workbooks" ariaLabel="Back" />}
        />
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
          <div className="text-destructive">Could not load workbook.</div>
          <div className="text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/workbooks">Back to workbooks</Link>
          </Button>
        </div>
      </>
    );
  }

  // Surface emitter for `matrx-user/workbooks` on the editor route. Identity
  // and permissions come from this page's state; sheets, snapshot, save
  // status and collab presence are read at trigger time from the mounted
  // editor via the scope source (null until Univer has booted, in which case
  // those keys are simply omitted).
  const getScope = () => {
    const live = readWorkbookScopeSource(id);
    return createWorkbooksScope({
      workbook_id: id,
      ...(workbook
        ? {
            workbook_name: workbook.workbook_name,
            ...(workbook.description
              ? { workbook_description: workbook.description }
              : {}),
            workbook_source: workbook.source,
            workbook_updated_at: workbook.updated_at,
            workbook_permissions: {
              is_owner: isOwner,
              can_edit: canEdit,
              is_public: workbook.is_public,
            },
            open_workbook: {
              id: workbook.id,
              name: workbook.workbook_name,
              description: workbook.description,
              source: workbook.source,
              version: workbook.version,
              is_public: workbook.is_public,
              original_file_id: workbook.original_file_id,
              created_at: workbook.created_at,
              updated_at: workbook.updated_at,
            },
          }
        : {}),
      ...(live
        ? {
            workbook_sheets: live.sheets,
            ...(live.activeSheetId
              ? { active_sheet_id: live.activeSheetId }
              : {}),
            ...(live.activeSheetName
              ? { active_sheet_name: live.activeSheetName }
              : {}),
            ...(live.snapshot ? { workbook_snapshot: live.snapshot } : {}),
            workbook_editor_status: {
              boot_state: live.bootState,
              load_error: live.loadError,
            },
            workbook_save_status: live.saveStatus,
            workbook_collab: live.collab,
          }
        : {}),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/workbooks"
      isEditable={canEdit}
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/workbooks" ariaLabel="Back" />
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
              className="h-7 min-w-0 max-w-[45vw] sm:max-w-xs text-sm font-medium border-0 bg-transparent shadow-none focus-visible:ring-1 px-1.5"
              disabled={!workbook || !canEdit}
              placeholder="Workbook name"
            />
            {renameSaving && (
              <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
            )}
          </>
        }
        right={
          workbook ? (
            <div className="flex items-center gap-0.5">
              <ReferenceCopyButton
                referenceType="workbook"
                id={workbook.id}
                label={workbook.workbook_name}
                toastLabel={workbook.workbook_name}
                size="sm"
              />
              <ShareButton
                resourceType="workbook"
                resourceId={workbook.id}
                resourceName={workbook.workbook_name}
                isOwner={isOwner}
                variant="ghost"
                size="sm"
              />
            </div>
          ) : undefined
        }
      />
      {/* Single full-page editor: Univer renders its own static top toolbar
          (Editing / Save now / Export / History), so the surface must start
          BELOW the glass header rather than scroll behind it — otherwise
          Univer's toolbar collides with the back button + name field. */}
      <div
        className="h-full w-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {permsResolved && workbook ? (
          <WorkbookEditor
            workbookId={id}
            workbookName={workbook.workbook_name}
            editable={canEdit}
            collab
          />
        ) : (
          <EditorBootSpinner />
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
