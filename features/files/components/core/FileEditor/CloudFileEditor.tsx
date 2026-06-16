/**
 * features/files/components/core/FileEditor/CloudFileEditor.tsx
 *
 * Edit-in-place dialog for text-like cloud files (code / markdown / text).
 *
 * Flow: open → useFileBlob streams the bytes through Python → text → Monaco
 * editor mounts with that text → user edits → Save uploads the new content
 * via `uploadFiles` to the same parent + filename. The Python backend turns
 * that into a new version of the file (matching upload semantics), so the
 * existing `FileVersionsList` shows the change and supports rollback.
 *
 * Implementation notes:
 *   • The editor is a Sheet (slides from the right, full height) so users
 *     have real screen real estate for editing — not a cramped Dialog.
 *   • Monaco is dynamically imported so the chunk only loads when the user
 *     actually clicks Edit — same pattern as other heavy previewers.
 *   • Dirty tracking guards an accidental close: confirm before discarding.
 *   • Save returns to the caller via `onSaved` (and closes the editor) so
 *     the host can refresh the version list / show a toast.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import { uploadFiles as uploadFilesThunk } from "@/features/files/redux/thunks";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

// Monaco is ~2MB; lazy-load so this dialog only pulls it in on demand.
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      </div>
    ),
  },
);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  sh: "shell",
  bash: "shell",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  html: "html",
  css: "css",
  scss: "scss",
  sql: "sql",
  txt: "plaintext",
};

function languageFor(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  return LANGUAGE_BY_EXT[fileName.slice(dot + 1).toLowerCase()] ?? "plaintext";
}

export interface CloudFileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  /** Called after a successful save (with the requestId of the upload). */
  onSaved?: () => void;
}

export function CloudFileEditor({
  open,
  onOpenChange,
  fileId,
  onSaved,
}: CloudFileEditorProps) {
  const dispatch = useAppDispatch();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { blob, loading, error: loadError } = useFileBlob(open ? fileId : null);

  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isDirty = text !== null && original !== null && text !== original;

  // Read the blob as text whenever the cached blob changes for this file.
  useEffect(() => {
    if (!open) {
      setText(null);
      setOriginal(null);
      setSaveError(null);
      return;
    }
    if (!blob) return;
    let cancelled = false;
    blob.text().then((value) => {
      if (cancelled) return;
      setText(value);
      setOriginal(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob, open]);

  const language = useMemo(
    () => (file ? languageFor(file.fileName) : "plaintext"),
    [file],
  );

  // Detect dark mode the same way CodePreview does — via the html.dark class.
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const handleSave = useCallback(async () => {
    if (!file || text === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Re-upload as the same filename to the same parent. The Python
      // backend treats that as a new version of the existing file.
      const reUploaded = new File(
        [new Blob([text], { type: file.mimeType ?? "text/plain" })],
        file.fileName,
        { type: file.mimeType ?? "text/plain" },
      );
      await dispatch(
        uploadFilesThunk({
          files: [reUploaded],
          parentFolderId: file.parentFolderId,
          visibility: file.visibility,
          changeSummary: "Edited in place",
        }),
      ).unwrap();
      setOriginal(text);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [dispatch, file, text, onOpenChange, onSaved]);

  const tryClose = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      if (isDirty) {
        setConfirmDiscard(true);
        return;
      }
      onOpenChange(false);
    },
    [isDirty, onOpenChange],
  );

  // Monaco's onMount gives us the editor instance; we use it to wire ⌘S/Ctrl+S
  // → save without leaving the editor.
  type MonacoEditorInstance = {
    addCommand: (keybinding: number, handler: () => void) => void;
  };
  type MonacoNamespace = {
    KeyMod: { CtrlCmd: number };
    KeyCode: { KeyS: number };
  };
  const handleEditorMount = useCallback(
    (editor: MonacoEditorInstance, monaco: MonacoNamespace) => {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void handleSave();
      });
    },
    [handleSave],
  );

  const fileName = file?.fileName ?? "";
  const saveDisabled = saving || !isDirty || text === null;

  // Monaco needs a stable container size; we use w-full h-full on the wrapper.
  const editorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={tryClose}
        dismissDisabled={saving}
        title={fileName || "Loading…"}
        description={
          <>
            Edits save as a new version.{" "}
            {isDirty ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Unsaved changes
              </span>
            ) : null}
          </>
        }
        headerActions={
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => tryClose(false)}
              className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveDisabled}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                saveDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
              title="Save (⌘S / Ctrl+S)"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
        position="right"
        defaultSize={50}
        maxSize={92}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        {saveError ? (
          <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {saveError}
          </p>
        ) : null}

        <div ref={editorRef} className="min-h-0 flex-1 overflow-hidden">
          {loadError ? (
            <div className="flex h-full w-full items-center justify-center p-6 text-sm text-destructive">
              Failed to load file: {loadError}
            </div>
          ) : loading || text === null ? (
            <div className="flex h-full w-full items-center justify-center bg-muted/20">
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <MonacoEditor
              height="100%"
              language={language}
              value={text}
              onChange={(value) => setText(value ?? "")}
              theme={isDark ? "vs-dark" : "vs"}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          )}
        </div>
      </MatrxDynamicPanelHost>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to <strong>{fileName}</strong> haven't been saved.
              Closing now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
