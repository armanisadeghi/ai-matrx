/**
 * features/files/components/core/FileEditor/CloudFileInlineEditor.tsx
 *
 * Inline (in-pane) Monaco editor for cloud-files. Mounts directly inside
 * the preview pane's Edit tab — no Sheet/Dialog wrapper. Sister of
 * `CloudFileEditor` (which wraps the same logic in a Sheet for full-screen
 * editing); they share semantics but this one is sized to its parent.
 *
 * Lifecycle:
 *   - Loads bytes via `useFileBlob` → `text()` → Monaco model.
 *   - Edits track `isDirty`. Save re-uploads under the same name + parent,
 *     producing a new version row server-side (same flow as
 *     `CloudFileEditor`). Cmd/Ctrl+S triggers save without leaving Monaco.
 *   - Best-effort flush on unmount (only when dirty + no in-flight error)
 *     so switching tabs doesn't drop in-progress edits.
 */

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileBlob } from "@/features/files/hooks/useFileBlob";
import { uploadFiles as uploadFilesThunk } from "@/features/files/redux/thunks";
import { extractErrorMessage } from "@/utils/errors";
import { useFileViewerControls } from "@/features/files/components/surfaces/FileViewerControlsContext";
import type { StandaloneCodeEditor } from "@/features/code/editor/MonacoEditor";

// Lazy — Monaco is ~600 KB. Only pulled in when the user actually opens
// the Edit tab.
const MonacoEditor = dynamic(
  () =>
    import("@/features/code/editor/MonacoEditor").then((m) => m.MonacoEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
  xml: "xml",
  // SVG is XML markup — Monaco's xml mode gives proper tag/attribute
  // highlighting and brace matching for direct vector edits.
  svg: "xml",
};

function languageFor(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  return LANGUAGE_BY_EXT[fileName.slice(dot + 1).toLowerCase()] ?? "plaintext";
}

export interface CloudFileInlineEditorProps {
  fileId: string;
  className?: string;
}

export function CloudFileInlineEditor({
  fileId,
  className,
}: CloudFileInlineEditorProps) {
  const dispatch = useAppDispatch();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { blob, loading, error: loadError } = useFileBlob(fileId);
  const controls = useFileViewerControls();
  // Hold onto the Monaco instance so the rail-driven controls effect can
  // forward `updateOptions` calls without bouncing through a remount.
  const editorRef = useRef<StandaloneCodeEditor | null>(null);
  const handleEditorMount = useCallback((editor: StandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);
  // Push rail-driven options into Monaco whenever they change. Effect (not
  // render) because `updateOptions` is an imperative API and the editor
  // owns the source of truth — re-creating Monaco on prop change would
  // wipe undo history, scroll position, and selection.
  useEffect(() => {
    if (!controls || !editorRef.current) return;
    editorRef.current.updateOptions({
      fontSize: controls.editorFontSize,
      wordWrap: controls.editorWordWrap ? "on" : "off",
      minimap: { enabled: controls.editorMinimap, renderCharacters: false },
      tabSize: controls.editorTabSize,
    });
  }, [
    controls,
    controls?.editorFontSize,
    controls?.editorWordWrap,
    controls?.editorMinimap,
    controls?.editorTabSize,
  ]);

  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDirty = text !== null && original !== null && text !== original;

  // Read the blob → text whenever the file changes / loads.
  useEffect(() => {
    setText(null);
    setOriginal(null);
    setSaveError(null);
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
  }, [blob, fileId]);

  const language = useMemo(
    () => (file ? languageFor(file.fileName) : "plaintext"),
    [file],
  );

  const handleSave = useCallback(async () => {
    if (!file || text === null) return;
    setSaving(true);
    setSaveError(null);
    try {
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
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [dispatch, file, text]);

  // Best-effort flush on unmount when there's a pending edit.
  useEffect(() => {
    return () => {
      if (
        text !== null &&
        original !== null &&
        text !== original &&
        file &&
        !saveError
      ) {
        const reUploaded = new File(
          [new Blob([text], { type: file.mimeType ?? "text/plain" })],
          file.fileName,
          { type: file.mimeType ?? "text/plain" },
        );
        void dispatch(
          uploadFilesThunk({
            files: [reUploaded],
            parentFolderId: file.parentFolderId,
            visibility: file.visibility,
            changeSummary: "Edited in place (auto-flush on unmount)",
          }),
        )
          .unwrap()
          .catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const handleDiscard = useCallback(() => {
    if (original !== null) setText(original);
    setSaveError(null);
  }, [original]);

  const recentlySaved =
    savedAt !== null && Date.now() - savedAt < 2000 && !isDirty;

  if (!file) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        File not found.
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center p-6 text-sm text-destructive",
          className,
        )}
      >
        Couldn&apos;t load file: {loadError}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full w-full min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-background px-3 py-1.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {file.fileName}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{language}</span>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : recentlySaved ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          ) : isDirty ? (
            <span className="text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || saving}
            title="Discard changes"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
              !isDirty || saving
                ? "border-border/60 bg-muted/30 text-muted-foreground cursor-not-allowed"
                : "border-border bg-background hover:bg-accent",
            )}
          >
            <RotateCcw className="h-3 w-3" />
            Discard
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saving}
            title="Save (⌘S / Ctrl+S)"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
              isDirty && !saving
                ? "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border/60 bg-muted/30 text-muted-foreground cursor-not-allowed",
            )}
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
      {saveError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {saveError}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {loading || text === null ? (
          <div className="flex h-full w-full items-center justify-center bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MonacoEditor
            value={text}
            language={language}
            path={`cloud-file:/${fileId}`}
            onChange={(next) => setText(next)}
            onSave={() => void handleSave()}
            onEditorMount={handleEditorMount}
          />
        )}
      </div>
    </div>
  );
}
