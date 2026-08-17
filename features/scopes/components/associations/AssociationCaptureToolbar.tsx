// features/scopes/components/associations/AssociationCaptureToolbar.tsx
//
// THE shared capture toolbar for any container's association surface — the
// upload / add-existing / create toolbar plus whole-body drag-and-drop, lifted
// from the War Room's ThreadResourcesTab (its first and reference consumer)
// so every container gets the same capture verbs from ONE home.
//
// Callback-pure and registry-driven: the host supplies ONE `attach` callback
// (canonical tokens only — `file`, `udt_document`) and this component owns the
// gesture end-to-end under the CREATE-then-ASSOCIATE contract (see the
// association-entity-select skill): the durable row is created FIRST through
// the canonical pipelines (`requestUpload` → files feature; `createDocument` →
// data-tables), the edge is written SECOND via the host's callback, and EVERY
// terminal outcome is loud — a created-but-unlinked item is reported WITH its
// location, never silently orphaned.
//
// Consumers:
// - War Room `ThreadResourcesTab` (behavior-identical lift; adds its own
//   Monaco "New file" via `extraActions`).
// - Masterwork Rulebook Sources (`RulebookSourcesPanel`) — the "dump
//   everything you have" Distillation surface.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import {
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
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
import { requestUpload } from "@/features/files/upload/uploadGuardOpeners";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import {
  createDocument,
  listAccessibleDocuments,
} from "@/features/data-tables/document-service";
import type { DocumentRow } from "@/features/data-tables/types";
import type { Visibility } from "@/features/files/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { cn } from "@/lib/utils";

export interface CaptureAttachResult {
  ok: boolean;
  /** Human error text — the toolbar toasts it. Omit when the host already did. */
  error?: string;
}

/**
 * ONE write callback for every capture verb. Tokens are canonical
 * (`file` / `udt_document`); the host maps to its own write path (an
 * association edge, a thread thunk, …) and reports the outcome honestly —
 * a silent no-op attach is the bug class this contract kills.
 */
export type CaptureAttach = (
  token: EntityTypeToken,
  resourceId: string,
  opts?: { label?: string },
) => Promise<CaptureAttachResult>;

export interface AssociationCaptureToolbarProps {
  attach: CaptureAttach;
  /** Logical cloud-files folder new uploads land in (auto-created). */
  uploadFolderPath: string;
  /** Visibility stamped on uploads. Default "personal". */
  uploadVisibility?: Visibility;
  /**
   * Where a created-but-unlinked upload is reported to live, e.g.
   * "your Files (War Room folder)". Keeps the loud-outcome copy honest.
   */
  uploadLocationLabel: string;
  /** The retry verb named in loud-outcome copy. Default '"Add file"'. */
  attachRetryLabel?: string;
  /** Copy for the existing-files picker dialog. */
  filePicker?: { title?: string; description?: string };
  /** Which built-in actions render. Default: all. */
  showActions?: {
    upload?: boolean;
    addFile?: boolean;
    newDocument?: boolean;
    addDocument?: boolean;
  };
  /** Hide the button row (compact variants) — drag-and-drop stays live. */
  showToolbar?: boolean;
  /** Extra host-specific buttons appended after the built-ins. */
  extraActions?: ReactNode;
  /** Open a freshly created document in a new tab. Default true. */
  openCreatedDocument?: boolean;
  className?: string;
  /** The body the drop target wraps (the list of attached things). */
  children?: ReactNode;
}

export function AssociationCaptureToolbar({
  attach,
  uploadFolderPath,
  uploadVisibility = "personal",
  uploadLocationLabel,
  attachRetryLabel = '"Add file"',
  filePicker,
  showActions,
  showToolbar = true,
  extraActions,
  openCreatedDocument = true,
  className,
  children,
}: AssociationCaptureToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);

  const actions = {
    upload: showActions?.upload ?? true,
    addFile: showActions?.addFile ?? true,
    newDocument: showActions?.newDocument ?? true,
    addDocument: showActions?.addDocument ?? true,
  };

  // ── Files: upload from disk → attach each returned cld_files.id ──────────
  //
  // CREATE-then-ASSOCIATE: the file row is created FIRST (durable — it lives
  // in the user's library under `uploadFolderPath` no matter what), the edge
  // is written SECOND, and EVERY terminal outcome is loud. A
  // created-but-unattached file is reported with its location — it must never
  // look like it "just disappeared".
  const uploadAndAttach = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    // Watchdog: if the upload pipeline never settles (hung dialog promise,
    // dead transport), SAY so — a stuck-silent gesture is the bug class.
    const watchdog = setTimeout(() => {
      console.error(
        "[AssociationCaptureToolbar] upload pipeline unresponsive >60s",
        { files: files.map((f) => f.name) },
      );
      toast.error(
        "The upload isn't responding — it may be stalled. Check your connection and retry.",
      );
    }, 60_000);
    try {
      const result = await requestUpload({
        files,
        folderPath: uploadFolderPath,
        visibility: uploadVisibility,
      });
      if (result.cancelled) {
        toast.info("Upload cancelled — nothing was attached");
        return;
      }
      const aliasedIds = result.aliased.map((a) => a.existingFileId);
      const ids = [...result.uploaded, ...aliasedIds];
      let attached = 0;
      const unattached: string[] = [];
      let firstAttachError: string | null = null;
      for (const id of ids) {
        const res = await attach("file", id);
        if (res.ok) {
          attached += 1;
        } else {
          unattached.push(id);
          if (!firstAttachError && res.error) firstAttachError = res.error;
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
          `Uploaded ${unattached.length === 1 ? "1 file" : `${unattached.length} files`} to ${uploadLocationLabel} but couldn't attach ${unattached.length === 1 ? "it" : "them"} here — use ${attachRetryLabel} to retry` +
            (firstAttachError ? ` (${firstAttachError})` : ""),
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
      console.error("[AssociationCaptureToolbar] upload flow failed", err);
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

  // Drop a file anywhere on the body → upload + attach. Without this the most
  // natural gesture had NO handler — the browser navigated to the file (or a
  // drag layer swallowed it) with zero feedback: the "file just disappeared"
  // bug class.
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
        title: filePicker?.title ?? "Attach files",
        description:
          filePicker?.description ??
          "Pick existing files from your cloud storage.",
      });
      if (!ids || ids.length === 0) return;
      let attached = 0;
      let firstAttachError: string | null = null;
      for (const id of ids) {
        const res = await attach("file", id);
        if (res.ok) attached += 1;
        else if (!firstAttachError && res.error) firstAttachError = res.error;
      }
      if (attached > 0) {
        toast.success(
          attached === 1 ? "Attached 1 file" : `Attached ${attached} files`,
        );
      }
      if (attached < ids.length && firstAttachError) {
        // Hosts whose attach path toasts its own failures return no `error`;
        // everyone else gets the loud outcome here.
        toast.error(`Couldn't attach: ${firstAttachError}`);
      }
    } catch (err) {
      console.error(
        "[AssociationCaptureToolbar] attach-existing flow failed",
        err,
      );
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
      const res = await attach("udt_document", doc.id, {
        label: doc.document_name,
      });
      setNewDocOpen(false);
      if (res.ok) {
        toast.success("Document created");
        if (openCreatedDocument) {
          window.open(`/documents/${doc.id}`, "_blank", "noopener,noreferrer");
        }
      } else {
        // Created but not linked — the document exists; never let it vanish.
        toast.error(
          `Created "${doc.document_name}" but couldn't attach it here — use "Add document" to retry`,
        );
      }
    } catch (err) {
      console.error(
        "[AssociationCaptureToolbar] create-document flow failed",
        err,
      );
      toast.error("Couldn't create the document");
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleAttachDoc = async (doc: DocumentRow) => {
    setDocPickerOpen(false);
    const res = await attach("udt_document", doc.id, {
      label: doc.document_name,
    });
    if (res.ok) toast.success("Document attached");
    else if (res.error) toast.error(`Couldn't attach: ${res.error}`);
  };

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col",
        isDragOver && "ring-2 ring-inset ring-primary/50",
        className,
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
            Drop to upload &amp; attach
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

      {/* ── capture toolbar ────────────────────────────────────────────── */}
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
          {actions.upload ? (
            <CaptureToolbarAction
              icon={isUploading ? Loader2 : Upload}
              spinning={isUploading}
              label="Upload"
              onClick={() => !isUploading && fileInputRef.current?.click()}
              disabled={isPicking || isUploading}
            />
          ) : null}
          {actions.addFile ? (
            <CaptureToolbarAction
              icon={isPicking ? Loader2 : FolderOpen}
              spinning={isPicking}
              label="Add file"
              onClick={handlePickExisting}
              disabled={isPicking || isUploading}
            />
          ) : null}
          {(actions.upload || actions.addFile) &&
          (actions.newDocument || actions.addDocument) ? (
            <span className="mx-1 h-4 w-px bg-border" />
          ) : null}
          {actions.newDocument ? (
            <CaptureToolbarAction
              icon={creatingDoc ? Loader2 : Plus}
              spinning={creatingDoc}
              label="New document"
              onClick={() => setNewDocOpen(true)}
              disabled={creatingDoc}
            />
          ) : null}
          {actions.addDocument ? (
            <CaptureToolbarAction
              icon={FileText}
              label="Add document"
              onClick={() => setDocPickerOpen(true)}
            />
          ) : null}
          {extraActions}
        </div>
      ) : null}

      {children}

      <TextInputDialog
        open={newDocOpen}
        onOpenChange={(o) => !creatingDoc && setNewDocOpen(o)}
        title="New document"
        description="Create a document and attach it here."
        placeholder="Document name"
        confirmLabel="Create"
        busy={creatingDoc}
        onConfirm={handleCreateDoc}
      />

      <CaptureDocumentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        onPick={handleAttachDoc}
      />
    </div>
  );
}

// ── toolbar chrome ──────────────────────────────────────────────────────────

/** The dense toolbar button (exported so hosts' extraActions match). */
export function CaptureToolbarAction({
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

// ── document picker (command palette over accessible documents) ─────────────

function CaptureDocumentPickerDialog({
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
        {open ? <CaptureDocumentPickerBody onPick={onPick} /> : null}
      </CommandList>
    </CommandDialog>
  );
}

function CaptureDocumentPickerBody({
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
