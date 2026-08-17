"use client";

// features/war-room/components/thread/ThreadResourcesTab.tsx
//
// The thread's RESOURCES tab — the first-class "everything attached to this
// thread" surface. One canonical <AssociationList> (grouped rows over EVERY
// attached entity type, universal search-attach, per-token pickers) driven by
// the war-room adapter (single-active demotion + Redux bucket preserved).
//
// The upload / drop / create toolbar this tab pioneered now lives in the
// SHARED `AssociationCaptureToolbar`
// (features/scopes/components/associations/AssociationCaptureToolbar.tsx) —
// this tab is its reference consumer, adding only the war-room-specific
// Monaco "New file" action via `extraActions`. Improvements to the capture
// verbs land there and reach every container at once.
//
// Replaces ThreadAttachmentsTab (files+documents only) and ThreadCanvasTab
// (a hand-rolled 5-type subset of this exact idea). File rows keep their
// media thumbnails via the `renderRow` override — never strip functionality.

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
  FileAudio,
  File as FileIcon,
  FilePlus2,
  FileVideo,
  Loader2,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { folderForWarRoomThread } from "@/features/files/utils/folder-conventions";
import { fileIdToMediaRef } from "@/features/files/redux/converters";
import { useFile } from "@/features/files/handler/hooks/useFile";
import type { ContainerResourceRow } from "@/features/scopes/components/associations/AssociationList";
import {
  AssociationCaptureToolbar,
  CaptureToolbarAction,
  type CaptureAttach,
} from "@/features/scopes/components/associations/AssociationCaptureToolbar";
import {
  WarRoomResourcesList,
  type ResourceRowContext,
} from "@/features/war-room/components/resources/WarRoomResourcesList";
import { attachEntityToThread } from "@/features/war-room/redux/thunks";
import { useThreadResourcesAdapter } from "@/features/war-room/hooks/useThreadResourcesAdapter";
import { cn } from "@/lib/utils";

// Code-split: the new-file dialog pulls the full Monaco editor. Loading it
// lazily keeps Monaco out of the War Room bundle.
const ThreadNewFileDialog = dynamic(
  () => import("./ThreadNewFileDialog").then((m) => m.ThreadNewFileDialog),
  { ssr: false },
);

export function ThreadResourcesTab({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const adapter = useThreadResourcesAdapter(threadId);
  const [newFileOpen, setNewFileOpen] = useState(false);

  // The ONE write callback the shared toolbar drives. The thread thunk keeps
  // its historical "user_file" spelling for file edges (it normalizes and
  // toasts its own failures, so no error text is returned — the toolbar must
  // not double-toast).
  const captureAttach: CaptureAttach = useCallback(
    async (token, resourceId, opts) => {
      const threadToken = token === "file" ? "user_file" : token;
      const ok = await dispatch(
        attachEntityToThread(
          threadId,
          threadToken,
          resourceId,
          opts?.label ? { label: opts.label } : {},
        ),
      );
      return { ok };
    },
    [dispatch, threadId],
  );

  return (
    <AssociationCaptureToolbar
      attach={captureAttach}
      uploadFolderPath={folderForWarRoomThread(threadId)}
      uploadLocationLabel="your Files (War Room folder)"
      filePicker={{
        title: "Attach files to this thread",
        description: "Pick existing files from your cloud storage.",
      }}
      showToolbar={!compact}
      extraActions={
        <CaptureToolbarAction
          icon={FilePlus2}
          label="New file"
          onClick={() => setNewFileOpen(true)}
        />
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1.5 py-2">
        <WarRoomResourcesList
          adapter={adapter}
          variant={compact ? "compact" : "full"}
          containerKind="thread"
          scopeKey={threadId}
          renderRow={(row, ctx) =>
            row.token === "file" ? (
              <FileResourceRow ctx={ctx} row={row} compact={compact} />
            ) : null
          }
        />
      </div>

      {newFileOpen && (
        <ThreadNewFileDialog
          threadId={threadId}
          open={newFileOpen}
          onOpenChange={setNewFileOpen}
        />
      )}
    </AssociationCaptureToolbar>
  );
}

// ── file row with media preview (renderRow override for token "file") ──────

function FileResourceRow({
  row,
  ctx,
  compact,
}: {
  row: ContainerResourceRow;
  ctx: ResourceRowContext;
  compact?: boolean;
}) {
  const fileId = row.resourceId;
  const { file, status } = useFile({ kind: "file_id", fileId });

  const name = file?.meta.fileName ?? ctx.title;
  const category = file?.meta.category;
  const isMedia = category === "IMAGE" || category === "VIDEO";
  const TypeIcon =
    category === "AUDIO"
      ? FileAudio
      : category === "VIDEO"
        ? FileVideo
        : FileIcon;

  return ctx.card(
    <div className={cn("flex items-start gap-2", ctx.busy && "opacity-50")}>
      {isMedia ? (
        <InlineMediaRef
          ref={fileIdToMediaRef(fileId)}
          size="xs"
          fit="cover"
          className="mt-0.5 shrink-0 rounded"
        />
      ) : (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded bg-muted">
          {status === "resolving" ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <TypeIcon className="size-3.5 text-muted-foreground" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {/* IDENTICAL to `DefaultResourceRow`'s title, deliberately. This
            override exists to swap in a media thumbnail, and the sweep missed
            it for exactly that reason: overriding `renderRow` opts a row out of
            every improvement the default row gets, so the one file row in the
            war room was the only resource whose name stayed inert after the
            rail was converted. `openInNewTab` for the same reason as the
            default — this is a rail inside the thread the user is working in,
            and navigating the current tab would cost them that thread. */}
        <EntityRef
          token="file"
          id={fileId}
          name={name}
          showIcon={false}
          openInNewTab
          className="text-sm text-foreground"
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {ctx.idPrefix}
          {!compact && file?.meta.mime ? (
            <span className="text-[10px] text-muted-foreground">
              {file.meta.mime}
            </span>
          ) : null}
          {row.originNote ? (
            <span className="text-[10px] text-muted-foreground">
              {row.originNote}
            </span>
          ) : null}
        </div>
      </div>
      {ctx.menu}
    </div>,
  );
}
