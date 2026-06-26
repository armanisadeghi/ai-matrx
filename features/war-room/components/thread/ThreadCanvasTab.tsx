"use client";

// features/war-room/components/thread/ThreadCanvasTab.tsx
//
// Canvas-anchored threads: a freeform launcher. The thread IS the identity —
// no task/project anchor required. Users pin resources (associations with
// metadata.canvas) and open each in a window panel on click.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  FilePlus2,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Loader2,
  NotebookPen,
  Paperclip,
  Plus,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  openFilePicker,
  requestUpload,
  folderForWarRoomThread,
  useFile,
} from "@/features/files";
import {
  createDocument,
  getDocument,
  listAccessibleDocuments,
} from "@/features/data-tables/document-service";
import type { DocumentRow } from "@/features/data-tables/types";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import {
  selectNoteById,
  selectAllNotesList,
} from "@/features/notes/redux/selectors";
import { fetchNotesList } from "@/features/notes/redux/thunks";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenItemDetailWindow } from "@/features/overlays/openers/itemDetailWindow";
import { selectCanvasResourcesForThread } from "@/features/war-room/redux/selectors";
import {
  attachCanvasResourceToThread,
  createCanvasThreadTask,
  detachThreadAttachment,
  loadThreadAttachments,
} from "@/features/war-room/redux/thunks";
import { WarRoomProjectPicker } from "../shared/WarRoomProjectPicker";
import type {
  CanvasResourceEntityType,
  WarRoomAssignment,
} from "@/features/war-room/types";
import { cn } from "@/lib/utils";

const ThreadNewFileDialog = dynamic(
  () => import("./ThreadNewFileDialog").then((m) => m.ThreadNewFileDialog),
  { ssr: false },
);

const RESOURCE_ICONS: Record<CanvasResourceEntityType, typeof ListChecks> = {
  task: ListChecks,
  project: FolderKanban,
  note: NotebookPen,
  user_file: Paperclip,
  document: FileText,
};

export function ThreadCanvasTab({
  threadId,
  compact,
}: {
  threadId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(selectCanvasResourcesForThread(threadId));
  const notesList = useAppSelector(selectAllNotesList);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void dispatch(loadThreadAttachments(threadId));
    void dispatch(fetchNotesList());
  }, [dispatch, threadId]);

  async function attach(
    entityType: CanvasResourceEntityType,
    entityId: string,
  ) {
    setBusy(true);
    const ok = await dispatch(
      attachCanvasResourceToThread(threadId, entityType, entityId),
    );
    setBusy(false);
    return ok;
  }

  async function handleNewTask(title: string) {
    setBusy(true);
    await dispatch(createCanvasThreadTask(threadId, title));
    setBusy(false);
    setNewTaskOpen(false);
  }

  async function handleProjectPick(projectId: string | null) {
    if (!projectId) return;
    const ok = await attach("project", projectId);
    if (ok) setProjectPickerOpen(false);
  }

  async function handleNotePick(noteId: string) {
    const ok = await attach("note", noteId);
    if (ok) setNotePickerOpen(false);
  }

  async function handleUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length) return;
    setBusy(true);
    try {
      const result = await requestUpload({
        files: Array.from(files),
        folderPath: folderForWarRoomThread(threadId),
        visibility: "private",
      });
      if (result.cancelled) return;
      const ids = [
        ...result.uploaded,
        ...result.aliased.map((a) => a.existingFileId),
      ];
      for (const id of ids) {
        await dispatch(attachCanvasResourceToThread(threadId, "user_file", id));
      }
    } catch {
      toast.error("Couldn't upload the file");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickExistingFile() {
    setBusy(true);
    try {
      const ids = await openFilePicker({ multi: true });
      for (const id of ids) {
        await dispatch(attachCanvasResourceToThread(threadId, "user_file", id));
      }
    } catch {
      toast.error("Couldn't attach the file");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDoc(title: string) {
    setBusy(true);
    try {
      const doc = await createDocument({ title: title.trim() || "Untitled" });
      await dispatch(
        attachCanvasResourceToThread(threadId, "document", doc.id),
      );
      setNewDocOpen(false);
    } catch {
      toast.error("Couldn't create the document");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickDoc(doc: DocumentRow) {
    const ok = await attach("document", doc.id);
    if (ok) setDocPickerOpen(false);
  }

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", !compact && "px-3 py-2")}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pin resources here — click any row to open it in a window.
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className="h-7 shrink-0 gap-1.5"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setNewTaskOpen(true)}>
              <ListChecks className="size-3.5 mr-2" />
              New task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProjectPickerOpen(true)}>
              <FolderKanban className="size-3.5 mr-2" />
              Link project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNotePickerOpen(true)}>
              <NotebookPen className="size-3.5 mr-2" />
              Link note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-3.5 mr-2" />
              Upload file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handlePickExistingFile()}>
              <Paperclip className="size-3.5 mr-2" />
              Attach file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNewFileOpen(true)}>
              <FilePlus2 className="size-3.5 mr-2" />
              New file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setNewDocOpen(true)}>
              <FileText className="size-3.5 mr-2" />
              New document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDocPickerOpen(true)}>
              <FileText className="size-3.5 mr-2" />
              Attach document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleUploadFiles(e)}
      />

      {resources.length === 0 ? (
        <div className="grid flex-1 place-items-center px-4 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="grid size-10 place-items-center rounded-full bg-muted/60">
              <LayoutGrid className="size-5" />
            </span>
            <p className="text-xs font-medium text-foreground">Canvas</p>
            <p className="max-w-xs text-xs">
              This thread is its own workspace. Add tasks, projects, notes,
              files, or documents — then open any of them from here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-thin">
          {resources.map((row) => (
            <CanvasResourceRow
              key={row.id}
              row={row}
              threadId={threadId}
              onRemove={() =>
                void dispatch(detachThreadAttachment(threadId, row))
              }
            />
          ))}
        </ul>
      )}

      <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only">Project picker anchor</span>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <p className="mb-2 text-xs font-semibold text-foreground">
            Link a project
          </p>
          <WarRoomProjectPicker
            value={null}
            onSelect={handleProjectPick}
            allowClear={false}
          />
        </PopoverContent>
      </Popover>

      <TextInputDialog
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
        title="New task"
        description="Create a task and pin it on this canvas."
        placeholder="Task name"
        confirmLabel="Create"
        busy={busy}
        onConfirm={handleNewTask}
      />

      <TextInputDialog
        open={newDocOpen}
        onOpenChange={setNewDocOpen}
        title="New document"
        placeholder="Document title"
        confirmLabel="Create"
        busy={busy}
        onConfirm={handleCreateDoc}
      />

      <NotePickerDialog
        open={notePickerOpen}
        onOpenChange={setNotePickerOpen}
        notes={notesList}
        onPick={handleNotePick}
      />

      <DocumentPickerDialog
        open={docPickerOpen}
        onOpenChange={setDocPickerOpen}
        onPick={handlePickDoc}
      />

      {newFileOpen ? (
        <ThreadNewFileDialog
          open={newFileOpen}
          onOpenChange={setNewFileOpen}
          threadId={threadId}
          attachTarget="canvas"
        />
      ) : null}
    </div>
  );
}

function CanvasResourceRow({
  row,
  threadId: _threadId,
  onRemove,
}: {
  row: WarRoomAssignment;
  threadId: string;
  onRemove: () => void;
}) {
  const entityType = row.entity_type as CanvasResourceEntityType;
  const Icon = RESOURCE_ICONS[entityType] ?? LayoutGrid;
  const openTask = useOpenTaskEditorWindow();
  const openNote = useOpenNoteInWindow();
  const openFile = useOpenFilePreviewWindow();
  const openItem = useOpenItemDetailWindow();

  const task = useAppSelector((s) =>
    entityType === "task" ? selectTaskById(s, row.entity_id) : undefined,
  );
  const project = useAppSelector((s) =>
    entityType === "project" ? selectProjectById(s, row.entity_id) : undefined,
  );
  const note = useAppSelector(
    useMemo(
      () =>
        entityType === "note" ? selectNoteById(row.entity_id) : () => undefined,
      [entityType, row.entity_id],
    ),
  );
  const fileMeta = useFile(
    entityType === "user_file"
      ? { kind: "file_id", fileId: row.entity_id }
      : null,
  );

  const [docTitle, setDocTitle] = useState<string | null>(null);
  useEffect(() => {
    if (entityType !== "document") return;
    let cancelled = false;
    void getDocument(row.entity_id).then((doc) => {
      if (!cancelled) setDocTitle(doc?.title ?? "Document");
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, row.entity_id]);

  const label =
    row.label?.trim() ||
    (entityType === "task"
      ? task?.title
      : entityType === "project"
        ? project?.name
        : entityType === "note"
          ? note?.label
          : entityType === "user_file"
            ? fileMeta.file?.name
            : entityType === "document"
              ? docTitle
              : null) ||
    "Untitled";

  function open() {
    switch (entityType) {
      case "task":
        openTask({ taskId: row.entity_id });
        break;
      case "project":
        openItem({
          itemType: "project",
          itemId: row.entity_id,
          initialName: project?.name,
        });
        break;
      case "note":
        openNote({ noteId: row.entity_id, title: note?.label ?? "Notes" });
        break;
      case "user_file":
        openFile({ fileId: row.entity_id });
        break;
      case "document":
        window.open(`/documents/${row.entity_id}`, "_blank", "noopener");
        break;
    }
  }

  return (
    <li>
      <div className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/30">
        <button
          type="button"
          onClick={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted/60 text-muted-foreground">
            {entityType === "user_file" &&
            fileMeta.file?.mime?.startsWith("image/") ? (
              <InlineMediaRef ref={row.entity_id} size="sm" rounded="md" />
            ) : (
              <Icon className="size-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {label}
            </span>
            <span className="block text-[10px] capitalize text-muted-foreground">
              {entityType === "user_file"
                ? "file"
                : entityType.replace("_", " ")}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove from canvas"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function NotePickerDialog({
  open,
  onOpenChange,
  notes,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: { id: string; label?: string | null }[];
  onPick: (noteId: string) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search notes…" />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>
        <CommandGroup heading="Notes">
          {notes.map((n) => (
            <CommandItem key={n.id} onSelect={() => onPick(n.id)}>
              {n.label?.trim() || "Untitled note"}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function DocumentPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (doc: DocumentRow) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listAccessibleDocuments()
      .then(setDocs)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search documents…" />
      <CommandList>
        {loading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CommandEmpty>No documents found.</CommandEmpty>
            <CommandGroup heading="Documents">
              {docs.map((d) => (
                <CommandItem key={d.id} onSelect={() => onPick(d)}>
                  {d.title?.trim() || "Untitled document"}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
