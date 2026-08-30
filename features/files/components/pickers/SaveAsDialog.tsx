/**
 * features/files/components/pickers/SaveAsDialog.tsx
 *
 * Export-to-cloud-files dialog. User picks a destination folder and a
 * filename. Callers typically use this to save generated content (a markdown
 * note, a rendered image, an exported data table, …).
 *
 * Adaptive: Dialog on desktop, Drawer on mobile.
 *
 * The DIALOG is the UI — the actual save happens on the caller's side (they
 * get the destination via `onSave` and call their own upload path). This
 * keeps SaveAsDialog useful for both direct-upload and download-to-disk flows.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, X } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFoldersMap } from "@/features/files/redux/selectors";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import { FileBreadcrumbs } from "@/features/files/components/core/FileBreadcrumbs/FileBreadcrumbs";
import { FileIcon } from "@ai-matrx/media/react";

// ---------------------------------------------------------------------------
// Declarative component
// ---------------------------------------------------------------------------

export interface SaveAsDestination {
  folderId: string | null;
  fileName: string;
}

export interface SaveAsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called with `{ folderId, fileName }` on confirm. Resolve (or reject) the
   * returned promise to control the dialog's loading state. When the promise
   * resolves, the dialog closes; when it rejects, the error is shown inline.
   */
  onSave: (dest: SaveAsDestination) => void | Promise<void>;
  /** Default filename shown in the input. */
  defaultFileName?: string;
  /** Starting folder. Defaults to root. */
  initialFolderId?: string | null;
  title?: string;
  description?: string;
  /** Label for the primary action. */
  confirmLabel?: string;
}

export function SaveAsDialog(props: SaveAsDialogProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <SaveAsDrawer {...props} />
  ) : (
    <SaveAsDialogDesktop {...props} />
  );
}

function SaveAsDialogDesktop(props: SaveAsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{props.title ?? "Save to cloud files"}</DialogTitle>
          {props.description ? (
            <DialogDescription>{props.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <SaveAsBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SaveAsDrawer(props: SaveAsDialogProps) {
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle>{props.title ?? "Save to cloud files"}</DrawerTitle>
          {props.description ? (
            <DrawerDescription>{props.description}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <div className="pb-safe">
          <SaveAsBody {...props} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function SaveAsBody({
  onOpenChange,
  onSave,
  defaultFileName = "",
  initialFolderId = null,
  confirmLabel = "Save",
}: SaveAsDialogProps) {
  const isMobile = useIsMobile();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    initialFolderId,
  );
  const [fileName, setFileName] = useState(defaultFileName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileNameInputRef = useRef<HTMLInputElement>(null);

  // Reset on reopen.
  useEffect(() => {
    setFileName(defaultFileName);
    setCurrentFolderId(initialFolderId);
    setError(null);
  }, [defaultFileName, initialFolderId]);

  // Auto-select the stem on mount so the user can start typing.
  useEffect(() => {
    const input = fileNameInputRef.current;
    if (!input) return;
    const dotIdx = input.value.lastIndexOf(".");
    if (dotIdx > 0) {
      input.focus();
      input.setSelectionRange(0, dotIdx);
    } else {
      input.select();
    }
  }, []);

  const foldersById = useAppSelector(selectAllFoldersMap);
  const { folders } = useFolderContents(currentFolderId);

  const currentFolder = currentFolderId ? foldersById[currentFolderId] : null;

  const handleConfirm = useCallback(async () => {
    if (!fileName.trim()) {
      setError("Please enter a file name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Promise.resolve(
        onSave({
          folderId: currentFolderId,
          fileName: fileName.trim(),
        }),
      );
      onOpenChange(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [currentFolderId, fileName, onOpenChange, onSave]);

  const Footer = isMobile ? DrawerFooter : DialogFooter;

  const targetPath = useMemo(() => {
    if (!currentFolder) return fileName.trim() || "(filename)";
    return `${currentFolder.folderPath}/${fileName.trim() || "(filename)"}`;
  }, [currentFolder, fileName]);

  return (
    <div className="flex min-h-0 flex-col">
      {/* Destination folder breadcrumbs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
        {currentFolderId ? (
          <button
            type="button"
            onClick={() => setCurrentFolderId(currentFolder?.parentId ?? null)}
            aria-label="Up one level"
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <FileBreadcrumbs
          folderId={currentFolderId}
          onNavigate={setCurrentFolderId}
        />
      </div>

      {/* Folder list — folders only (files aren't selectable here) */}
      <ul className="max-h-[36dvh] overflow-auto overscroll-contain divide-y">
        {folders.length === 0 ? (
          <li className="flex items-center justify-center p-4 text-xs text-muted-foreground">
            No subfolders here.
          </li>
        ) : null}
        {folders.map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              onClick={() => setCurrentFolderId(folder.id)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent/60"
            >
              <FileIcon isFolder size={18} />
              <span className="flex-1 truncate">{folder.folderName}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* File name input */}
      <div className="border-t bg-muted/10 p-4 space-y-2">
        <label className="block text-xs text-muted-foreground">
          File name
          <input
            ref={fileNameInputRef}
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="my-file.md"
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && fileName.trim() && !submitting) {
                e.preventDefault();
                void handleConfirm();
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="text-[11px] text-muted-foreground truncate">
          Saving to <span className="font-mono">{targetPath}</span>
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <Footer>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={submitting || !fileName.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          {confirmLabel}
        </button>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imperative hook
// ---------------------------------------------------------------------------

export interface UseSaveAsOpenOptions {
  defaultFileName?: string;
  initialFolderId?: string | null;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export interface UseSaveAsResult {
  /** Resolves with the destination, or `null` if cancelled. */
  open: (options?: UseSaveAsOpenOptions) => Promise<SaveAsDestination | null>;
  element: React.ReactNode;
  isOpen: boolean;
}

export function useSaveAs(): UseSaveAsResult {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<UseSaveAsOpenOptions | null>(null);
  const resolverRef = useRef<
    ((result: SaveAsDestination | null) => void) | null
  >(null);

  const open = useCallback(
    (nextOptions: UseSaveAsOpenOptions = {}) =>
      new Promise<SaveAsDestination | null>((resolve) => {
        resolverRef.current?.(null);
        resolverRef.current = resolve;
        setOptions(nextOptions);
        setIsOpen(true);
      }),
    [],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      resolverRef.current?.(null);
      resolverRef.current = null;
    }
    setIsOpen(next);
  }, []);

  const handleSave = useCallback((dest: SaveAsDestination) => {
    resolverRef.current?.(dest);
    resolverRef.current = null;
  }, []);

  const element = useMemo(
    () =>
      options ? (
        <SaveAsDialog
          open={isOpen}
          onOpenChange={handleOpenChange}
          onSave={handleSave}
          defaultFileName={options.defaultFileName}
          initialFolderId={options.initialFolderId ?? null}
          title={options.title}
          description={options.description}
          confirmLabel={options.confirmLabel}
        />
      ) : null,
    [isOpen, options, handleOpenChange, handleSave],
  );

  return { open, element, isOpen };
}
