"use client";

// features/war-room/components/tile/TileAttachmentsTab.tsx
//
// Files & Documents view for a tile. Two sections backed by ONE polymorphic
// link table (ctx_war_room_tile_attachments, entity_type ∈ user_file|document):
//
//   • Files     — REAL cloud files (cld_files). Upload (requestUpload) or pick
//                 an existing file (openFilePicker), both from @/features/files.
//                 Rows hydrate via useFile and render media with InlineMediaRef
//                 (durable, never a raw <img>); non-media rows are an icon line
//                 with an "open" link.
//   • Documents — REAL editable documents (udt_documents). New (createDocument
//                 → open /documents/[id]) or attach an existing one (picked from
//                 listAccessibleDocuments). Rows open the doc in a new tab.
//
// The tile owns nothing but the LINK — files live in the file system, documents
// in the data-tables feature. Removing a row detaches the link; the file/doc is
// untouched. The `compact` variant (combined "All" view) drops the upload/pick
// chrome and just lists what's attached.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Paperclip,
  FileText,
  FolderOpen,
  Upload,
  Plus,
  FilePlus2,
  Loader2,
  ExternalLink,
  X,
  File as FileIcon,
  FileAudio,
  FileVideo,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import {
  InlineMediaRef,
  openFilePicker,
  requestUpload,
  folderForWarRoomTile,
  fileIdToMediaRef,
  useFile,
  useFileSrc,
} from "@/features/files";
import {
  createDocument,
  listAccessibleDocuments,
  getDocument,
} from "@/features/data-tables/document-service";
import type { DocumentRow } from "@/features/data-tables/types";
import { selectAttachmentsForTile } from "@/features/war-room/redux/selectors";
import {
  loadTileAttachments,
  attachFileToTile,
  attachDocumentToTile,
  detachTileAttachment,
} from "@/features/war-room/redux/thunks";
import type { WarRoomAssignment } from "@/features/war-room/types";
import { cn } from "@/lib/utils";

// Code-split: the new-file dialog pulls the full Monaco editor. Loading it lazily
// keeps Monaco out of the War Room bundle; it loads the first time a user opens
// the "New file" flow.
const TileNewFileDialog = dynamic(
  () => import("./TileNewFileDialog").then((m) => m.TileNewFileDialog),
  { ssr: false },
);

export function TileAttachmentsTab({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const attachments = useAppSelector(selectAttachmentsForTile(tileId));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);

  // Hydrate the tile's attachment rows on mount (idempotent — also seeded by
  // the room-load batch, but this covers a tile opened in isolation).
  useEffect(() => {
    void dispatch(loadTileAttachments(tileId));
  }, [dispatch, tileId]);

  const fileRows = attachments.filter((a) => a.entity_type === "user_file");
  const docRows = attachments.filter((a) => a.entity_type === "document");

  // ── Files: upload from disk → attach each returned cld_files.id ──────────
  const handleUploadClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const result = await requestUpload({
        files: Array.from(files),
        folderPath: folderForWarRoomTile(tileId),
        visibility: "private",
      });
      if (result.cancelled) return;
      // Attach freshly-uploaded files AND any the dedup dialog aliased to an
      // existing copy — from the tile's view they're all "attach this file".
      const aliasedIds = result.aliased.map((a) => a.existingFileId);
      const ids = [...result.uploaded, ...aliasedIds];
      let attached = 0;
      for (const id of ids) {
        if (await dispatch(attachFileToTile(tileId, id))) attached += 1;
      }
      if (attached > 0) {
        toast.success(
          attached === 1
            ? "Attached 1 file"
            : `Attached ${attached} files`,
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
    } finally {
      setIsUploading(false);
    }
  };

  // ── Files: pick existing cloud files → attach each id ────────────────────
  const handlePickExisting = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const ids = await openFilePicker({
        multi: true,
        title: "Attach files to this tile",
        description: "Pick existing files from your cloud storage.",
      });
      if (!ids || ids.length === 0) return;
      let attached = 0;
      for (const id of ids) {
        if (await dispatch(attachFileToTile(tileId, id))) attached += 1;
      }
      if (attached > 0) {
        toast.success(
          attached === 1 ? "Attached 1 file" : `Attached ${attached} files`,
        );
      }
    } finally {
      setIsPicking(false);
    }
  };

  // ── Documents: create a new doc, attach it, open it ──────────────────────
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
        attachDocumentToTile(tileId, doc.id, doc.document_name),
      );
      setNewDocOpen(false);
      if (ok) {
        toast.success("Document created");
        window.open(`/documents/${doc.id}`, "_blank", "noopener,noreferrer");
      }
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleAttachDoc = async (doc: DocumentRow) => {
    setDocPickerOpen(false);
    const ok = await dispatch(
      attachDocumentToTile(tileId, doc.id, doc.document_name),
    );
    if (ok) toast.success("Document attached");
  };

  const remove = (a: WarRoomAssignment) =>
    dispatch(detachTileAttachment(tileId, a));

  // ── Compact (combined "All" view): list only, no chrome ─────────────────
  if (compact) {
    if (attachments.length === 0) {
      return (
        <div className="grid h-full place-items-center px-3">
          <p className="text-[11px] text-muted-foreground">
            No files or documents attached.
          </p>
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto scrollbar-thin py-1">
        {fileRows.map((a) => (
          <FileAttachmentRow key={a.id} attachment={a} onRemove={remove} compact />
        ))}
        {docRows.map((a) => (
          <DocAttachmentRow key={a.id} attachment={a} onRemove={remove} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFilesSelected}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {/* ── Files ──────────────────────────────────────────────────── */}
        <SectionHeader
          icon={Paperclip}
          label="Files"
          count={fileRows.length}
          actions={
            <>
              <SectionAction
                icon={FilePlus2}
                label="New file"
                onClick={() => setNewFileOpen(true)}
                disabled={isPicking || isUploading}
              />
              <SectionAction
                icon={isPicking ? Loader2 : FolderOpen}
                spinning={isPicking}
                label="Add existing"
                onClick={handlePickExisting}
                disabled={isPicking || isUploading}
              />
              <SectionAction
                icon={isUploading ? Loader2 : Upload}
                spinning={isUploading}
                label="Upload"
                onClick={handleUploadClick}
                disabled={isPicking || isUploading}
              />
            </>
          }
        />
        {fileRows.length === 0 ? (
          <EmptyHint text="Upload a file or attach one from your cloud storage." />
        ) : (
          <div>
            {fileRows.map((a) => (
              <FileAttachmentRow key={a.id} attachment={a} onRemove={remove} />
            ))}
          </div>
        )}

        {/* ── Documents ──────────────────────────────────────────────── */}
        <SectionHeader
          icon={FileText}
          label="Documents"
          count={docRows.length}
          actions={
            <>
              <SectionAction
                icon={FolderOpen}
                label="Add document"
                onClick={() => setDocPickerOpen(true)}
              />
              <SectionAction
                icon={creatingDoc ? Loader2 : Plus}
                spinning={creatingDoc}
                label="New document"
                onClick={() => setNewDocOpen(true)}
                disabled={creatingDoc}
              />
            </>
          }
        />
        {docRows.length === 0 ? (
          <EmptyHint text="Create a new document or attach an existing one." />
        ) : (
          <div>
            {docRows.map((a) => (
              <DocAttachmentRow key={a.id} attachment={a} onRemove={remove} />
            ))}
          </div>
        )}
      </div>

      <TextInputDialog
        open={newDocOpen}
        onOpenChange={(o) => !creatingDoc && setNewDocOpen(o)}
        title="New document"
        description="Create a document and attach it to this tile."
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

      {/* Mounted only once opened so Monaco never loads until the user creates a
          file (the dynamic import + this guard keep it out of the room bundle). */}
      {newFileOpen && (
        <TileNewFileDialog
          tileId={tileId}
          open={newFileOpen}
          onOpenChange={setNewFileOpen}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Section chrome
// ───────────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  count,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  actions: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border/60 bg-card/85 px-2 py-1.5 backdrop-blur-sm">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground/60">
        ({count})
      </span>
      <div className="ml-auto flex items-center gap-0.5">{actions}</div>
    </div>
  );
}

function SectionAction({
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[11px] text-muted-foreground/70">{text}</p>
    </div>
  );
}

function RowShell({
  children,
  onRemove,
  compact,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 border-b border-border/20 px-2 transition-colors hover:bg-accent/30",
        compact ? "py-1" : "py-1.5",
      )}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="Remove attachment"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// File row — hydrates the cld_files row by id via useFile, renders media with
// InlineMediaRef (durable) and non-media as an icon line with an open link.
// ───────────────────────────────────────────────────────────────────────────

function FileAttachmentRow({
  attachment,
  onRemove,
  compact,
}: {
  attachment: WarRoomAssignment;
  onRemove: (a: WarRoomAssignment) => void;
  compact?: boolean;
}) {
  const fileId = attachment.entity_id;
  const { file, status } = useFile({ kind: "file_id", fileId });
  const src = useFileSrc({ kind: "file_id", fileId });

  const name = file?.meta.fileName ?? attachment.label ?? "File";
  const category = file?.meta.category;
  const isImage = category === "IMAGE";
  const isVideo = category === "VIDEO";
  const isAudio = category === "AUDIO";
  const isMedia = isImage || isVideo;

  const TypeIcon = isAudio ? FileAudio : isVideo ? FileVideo : FileIcon;

  return (
    <RowShell onRemove={() => onRemove(attachment)} compact={compact}>
      {isMedia ? (
        <InlineMediaRef
          ref={fileIdToMediaRef(fileId)}
          size="xs"
          fit="cover"
          className="shrink-0 rounded"
        />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded bg-muted">
          {status === "resolving" ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : (
            <TypeIcon className="size-3.5 text-muted-foreground" />
          )}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">{name}</p>
        {!compact && file?.meta.mime ? (
          <p className="truncate text-[10px] text-muted-foreground">
            {file.meta.mime}
          </p>
        ) : null}
      </div>
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
          title="Open file"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </RowShell>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Document row — hydrates the udt_documents row by id, opens /documents/[id].
// ───────────────────────────────────────────────────────────────────────────

function DocAttachmentRow({
  attachment,
  onRemove,
  compact,
}: {
  attachment: WarRoomAssignment;
  onRemove: (a: WarRoomAssignment) => void;
  compact?: boolean;
}) {
  const documentId = attachment.entity_id;
  const [doc, setDoc] = useState<DocumentRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDocument(documentId).then((res) => {
      if (!cancelled && res.success) setDoc(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const name = doc?.document_name ?? attachment.label ?? "Document";

  return (
    <RowShell onRemove={() => onRemove(attachment)} compact={compact}>
      <Link
        href={`/documents/${documentId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded bg-muted">
          <FileText className="size-3.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-foreground">{name}</p>
          {!compact && doc?.description ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {doc.description}
            </p>
          ) : null}
        </div>
        <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
      </Link>
    </RowShell>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Document picker — a command palette over the user's accessible documents.
// Reuses the canonical Command dialog primitive rather than hand-rolling a list.
// ───────────────────────────────────────────────────────────────────────────

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
        {/* Body mounts fresh on each open, so its initial `null` is the loading
            state and setState happens only in the async callback (no
            synchronous reset in an effect). */}
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
