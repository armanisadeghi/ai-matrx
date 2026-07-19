"use client";

// features/war-room/components/thread/ThreadResourcesTab.tsx
//
// The thread's RESOURCES tab — the first-class "everything attached to this
// thread" surface. One canonical <AssociationList> (grouped rows over EVERY
// attached entity type, universal search-attach, per-token pickers) driven by
// the war-room adapter (single-active demotion + Redux bucket preserved), plus
// the war-room creation flows the old files tab owned: Upload / Add existing /
// New file (Monaco) / New document / Add document.
//
// Replaces ThreadAttachmentsTab (files+documents only) and ThreadCanvasTab
// (a hand-rolled 5-type subset of this exact idea). File rows keep their
// media thumbnails via the `renderRow` override — never strip functionality.

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  FileAudio,
  File as FileIcon,
  FilePlus2,
  FileText,
  FileVideo,
  FolderOpen,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  InlineMediaRef,
  requestUpload,
  openFilePicker,
  folderForWarRoomThread,
  fileIdToMediaRef,
  useFile,
} from "@/features/files";
import {
  createDocument,
  listAccessibleDocuments,
} from "@/features/data-tables/document-service";
import type { DocumentRow } from "@/features/data-tables/types";
import type { ContainerResourceRow } from "@/features/scopes/components/associations/AssociationList";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);

  // ── Files: upload from disk → attach each returned cld_files.id ──────────
  //
  // CREATE-then-ASSOCIATE contract (see the association-entity-select skill):
  // the file row is created FIRST (durable — it lives in the user's library
  // under War Room/<thread> no matter what), the edge is written SECOND, and
  // EVERY terminal outcome is loud. A created-but-unattached file is reported
  // with its location — it must never look like it "just disappeared".
  const uploadAndAttach = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    // Watchdog: if the upload pipeline never settles (hung dialog promise,
    // dead transport), SAY so — a stuck-silent gesture is the bug class.
    const watchdog = setTimeout(() => {
      console.error("[ThreadResourcesTab] upload pipeline unresponsive >60s", {
        files: files.map((f) => f.name),
      });
      toast.error(
        "The upload isn't responding — it may be stalled. Check your connection and retry.",
      );
    }, 60_000);
    try {
      console.info("[war-room upload] start", files.map((f) => f.name));
      const result = await requestUpload({
        files,
        folderPath: folderForWarRoomThread(threadId),
        visibility: "private",
      });
      console.info("[war-room upload] pipeline result", {
        uploaded: result.uploaded.length,
        aliased: result.aliased.length,
        failed: result.failed.length,
        cancelled: result.cancelled,
      });
      if (result.cancelled) {
        toast.info("Upload cancelled — nothing was attached");
        return;
      }
      const aliasedIds = result.aliased.map((a) => a.existingFileId);
      const ids = [...result.uploaded, ...aliasedIds];
      let attached = 0;
      const unattached: string[] = [];
      for (const id of ids) {
        if (await dispatch(attachEntityToThread(threadId, "user_file", id))) {
          attached += 1;
        } else {
          unattached.push(id);
        }
      }
      if (attached > 0) {
        toast.success(
          attached === 1 ? "Attached 1 file" : `Attached ${attached} files`,
        );
      }
      if (unattached.length > 0) {
        // The upload SUCCEEDED — the file exists in the library. Say so, and
        // say where, instead of letting it vanish.
        toast.error(
          `Uploaded ${unattached.length === 1 ? "1 file" : `${unattached.length} files`} to your Files (War Room folder) but couldn't attach ${unattached.length === 1 ? "it" : "them"} here — use "Add file" to retry`,
        );
      }
      if (result.failed.length > 0) {
        const first = result.failed[0];
        toast.error(
          result.failed.length === 1
            ? `Failed to upload ${first.name}: ${first.error}`
            : `Failed to upload ${result.failed.length} files`,
        );
      }
      if (ids.length === 0 && result.failed.length === 0) {
        // Guard-host edge case (everything skipped in the duplicate dialog
        // with no alias chosen) — never end a user gesture in silence.
        toast.info("Nothing was uploaded or attached");
      }
    } catch (err) {
      console.error("[ThreadResourcesTab] upload flow failed", err);
      toast.error(
        err instanceof Error && err.message
          ? `Upload failed: ${err.message}`
          : "Upload failed unexpectedly",
      );
    } finally {
      clearTimeout(watchdog);
      setIsUploading(false);
    }
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    void uploadAndAttach(files);
  };

  // Drop a file anywhere on the tab body → upload + attach. Without this the
  // most natural gesture had NO handler — the browser navigated to the file
  // (or a drag layer swallowed it) with zero feedback: the "file just
  // disappeared" bug class.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    void uploadAndAttach(files);
  };

  // ── Files: pick existing cloud files ──────────────────────────────────────
  const handlePickExisting = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const ids = await openFilePicker({
        multi: true,
        title: "Attach files to this thread",
        description: "Pick existing files from your cloud storage.",
      });
      if (!ids || ids.length === 0) return;
      let attached = 0;
      for (const id of ids) {
        if (await dispatch(attachEntityToThread(threadId, "user_file", id))) {
          attached += 1;
        }
      }
      if (attached > 0) {
        toast.success(
          attached === 1 ? "Attached 1 file" : `Attached ${attached} files`,
        );
      }
      // attach failures already toast inside attachEntityToThread
    } catch (err) {
      console.error("[ThreadResourcesTab] attach-existing flow failed", err);
      toast.error("Couldn't attach the selected files");
    } finally {
      setIsPicking(false);
    }
  };

  // ── Documents ─────────────────────────────────────────────────────────────
  const handleCreateDoc = async (name: string) => {
    setCreatingDoc(true);
    try {
      const result = await createDocument({ name });
      if (!result.success) {
        toast.error("Couldn't create the document");
        return;
      }
      const doc = result.data;
      const ok = await dispatch(
        attachEntityToThread(threadId, "udt_document", doc.id, {
          label: doc.document_name,
        }),
      );
      setNewDocOpen(false);
      if (ok) {
        toast.success("Document created");
        window.open(`/documents/${doc.id}`, "_blank", "noopener,noreferrer");
      } else {
        // Created but not linked — the document exists; never let it vanish.
        toast.error(
          `Created "${doc.document_name}" but couldn't attach it here — use "Add document" to retry`,
        );
      }
    } catch (err) {
      console.error("[ThreadResourcesTab] create-document flow failed", err);
      toast.error("Couldn't create the document");
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleAttachDoc = async (doc: DocumentRow) => {
    setDocPickerOpen(false);
    const ok = await dispatch(
      attachEntityToThread(threadId, "udt_document", doc.id, {
        label: doc.document_name,
      }),
    );
    if (ok) toast.success("Document attached");
  };

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col",
        isDragOver && "ring-2 ring-inset ring-primary/50",
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/70">
          <span className="flex items-center gap-2 rounded-md border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground">
            <Upload className="size-3.5 text-primary" />
            Drop to upload & attach
          </span>
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFilesSelected}
      />

      {/* ── creation toolbar (full variant only) ─────────────────────── */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
          <ToolbarAction
            icon={isUploading ? Loader2 : Upload}
            spinning={isUploading}
            label="Upload"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            disabled={isPicking || isUploading}
          />
          <ToolbarAction
            icon={isPicking ? Loader2 : FolderOpen}
            spinning={isPicking}
            label="Add file"
            onClick={handlePickExisting}
            disabled={isPicking || isUploading}
          />
          <ToolbarAction
            icon={FilePlus2}
            label="New file"
            onClick={() => setNewFileOpen(true)}
            disabled={isPicking || isUploading}
          />
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarAction
            icon={creatingDoc ? Loader2 : Plus}
            spinning={creatingDoc}
            label="New document"
            onClick={() => setNewDocOpen(true)}
            disabled={creatingDoc}
          />
          <ToolbarAction
            icon={FileText}
            label="Add document"
            onClick={() => setDocPickerOpen(true)}
          />
        </div>
      )}

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

      <TextInputDialog
        open={newDocOpen}
        onOpenChange={(o) => !creatingDoc && setNewDocOpen(o)}
        title="New document"
        description="Create a document and attach it to this thread."
        placeholder="Document name"
        confirmLabel="Create"
        busy={creatingDoc}
        onConfirm={handleCreateDoc}
      />

      <DocumentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        onPick={handleAttachDoc}
      />

      {newFileOpen && (
        <ThreadNewFileDialog
          threadId={threadId}
          open={newFileOpen}
          onOpenChange={setNewFileOpen}
        />
      )}
    </div>
  );
}

// ── toolbar chrome ──────────────────────────────────────────────────────────

function ToolbarAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  spinning,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
    >
      <Icon className={cn("size-3.5", spinning && "animate-spin")} />
      {label}
    </Button>
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
        <p className="truncate text-sm text-foreground">{name}</p>
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

// ── document picker (command palette over accessible documents) ─────────────

function DocumentPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (doc: DocumentRow) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search documents…" />
      <CommandList>
        {open ? <DocumentPickerBody onPick={onPick} /> : null}
      </CommandList>
    </CommandDialog>
  );
}

function DocumentPickerBody({
  onPick,
}: {
  onPick: (doc: DocumentRow) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAccessibleDocuments().then((res) => {
      if (cancelled) return;
      setDocs(res.success ? res.data : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (docs === null) {
    return (
      <div className="grid place-items-center py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <CommandEmpty>No documents found.</CommandEmpty>
      <CommandGroup heading="Your documents">
        {docs.map((doc) => (
          <CommandItem
            key={doc.id}
            value={`${doc.document_name} ${doc.id}`}
            onSelect={() => onPick(doc)}
          >
            <FileText className="size-4 text-muted-foreground" />
            <span className="truncate">{doc.document_name}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
