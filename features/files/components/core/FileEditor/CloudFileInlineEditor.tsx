/**
 * features/files/components/core/FileEditor/CloudFileInlineEditor.tsx
 *
 * Inline (in-pane) Monaco editor for cloud-files. Mounts directly inside
 * the preview pane's Edit tab and is the body of the `cloud-file-editor`
 * canvas tab (a preview's Edit action) — no Sheet/Dialog wrapper; sized to
 * its parent.
 *
 * It is a VIEW of the file's one working copy — THE working-copy primitive
 * (`lib/working-copy`, `workingCopies["file:<id>"]`, `useFileWorkingCopy`):
 * the text, the dirty state, the saving/saved/error state all live there,
 * keyed by file id. So any number of views of one file (two board tiles, a tile and the
 * Files page) edit one copy, and a view that is hidden and shown (a sleeping
 * board tile — React `<Activity>`), remounted, or reopened shows exactly
 * what was typed. Monaco's undo history survives too: the editor keeps its
 * model (`keepModel`), keyed by the file's path, and every view shares it.
 *
 * Saving: the Save button and Cmd/Ctrl+S save the copy as the file's next
 * version (`fileWorkingCopy.flush(id, "manual")`, the one save path). The
 * last view leaving — hide, unmount, switching file — saves an unsaved copy
 * once; `pagehide` saves too and keeps the unsaved text for a reload.
 */

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileWorkingCopy } from "@/features/files/hooks/useFileWorkingCopy";
import { WorkingCopyAlert } from "@/lib/working-copy/WorkingCopyAlert";
import {
  clearFileDraft,
  fileWorkingCopy,
  storeFileDraft,
} from "@/features/files/redux/working-copy";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  useFileViewerControls,
  type FileViewerControlsApi,
} from "@/features/files/components/surfaces/FileViewerControlsContext";
import type { StandaloneCodeEditor } from "@/features/code/editor/MonacoEditor";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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

/** Prose reads as paragraphs, so it wraps unless the person turns wrap off. */
const PROSE_LANGUAGES = new Set(["plaintext", "markdown"]);

/**
 * The control rail's editor options (font size, wrap, minimap, tab size).
 * Without a rail (the editor in a canvas pane) prose wraps: a plain-text
 * note in a 360px pane otherwise runs off the right edge one line per
 * paragraph. Code keeps Monaco's no-wrap default.
 */
function applyRailOptions(
  editor: StandaloneCodeEditor | null,
  controls: FileViewerControlsApi | null,
  language: string,
): void {
  if (!editor) return;
  if (!controls) {
    editor.updateOptions({
      wordWrap: PROSE_LANGUAGES.has(language) ? "on" : "off",
    });
    return;
  }
  editor.updateOptions({
    fontSize: controls.editorFontSize,
    wordWrap: controls.editorWordWrap ? "on" : "off",
    minimap: { enabled: controls.editorMinimap, renderCharacters: false },
    tabSize: controls.editorTabSize,
  });
}

export interface CloudFileInlineEditorProps {
  fileId: string;
  className?: string;
}

export function CloudFileInlineEditor({
  fileId,
  className,
}: CloudFileInlineEditorProps) {
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { copy, loading, error: loadError } = useFileWorkingCopy(fileId);
  const controls = useFileViewerControls();
  // The live Monaco instance (a new one after every show), so rail changes
  // reach it without re-creating it.
  const editorRef = useRef<StandaloneCodeEditor | null>(null);
  const language = file ? languageFor(file.fileName) : "plaintext";
  useEffect(() => {
    applyRailOptions(editorRef.current, controls, language);
  }, [
    language,
    controls,
    controls?.editorFontSize,
    controls?.editorWordWrap,
    controls?.editorMinimap,
    controls?.editorTabSize,
  ]);

  // The last view leaving saves an unsaved copy (the working copy does it).
  // `pagehide` saves too and keeps the text for a reload of this tab.
  useEffect(() => {
    const onPageHide = () => {
      const current = fileWorkingCopy.entry(fileId);
      if (current?.value !== undefined && current.dirty) {
        storeFileDraft(fileId, {
          text: current.value,
          baseVersion: current.baseVersion,
          base: current.base ?? null,
        });
      }
      void fileWorkingCopy.flush(fileId);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [fileId]);

  if (!file) {
    return <AccessGate token="file" id={fileId} />;
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
        <ErrorAlchemyMenu error={loadError} />
      </div>
    );
  }

  const isDirty = copy?.dirty ?? false;
  const saving = copy?.status === "saving";
  const saveError = copy?.saveError ?? null;
  const recentlySaved =
    copy?.savedAt != null && Date.now() - copy.savedAt < 2000 && !isDirty;
  const save = () => {
    void fileWorkingCopy.flush(fileId, "manual");
  };
  const discard = () => {
    fileWorkingCopy.discard(fileId);
    clearFileDraft(fileId);
  };

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
            onClick={discard}
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
            onClick={save}
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
      <WorkingCopyAlert kind={fileWorkingCopy} id={fileId} showFailure={false} />
      {saveError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-ink">
          {saveError}
          <ErrorAlchemyMenu error={saveError} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {loading || !copy ? (
          <div className="flex h-full w-full items-center justify-center bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MonacoEditor
            value={copy.value ?? ""}
            language={language}
            path={`cloud-file:/${fileId}`}
            keepModel
            onChange={(next) => fileWorkingCopy.edit(fileId, next)}
            onSave={save}
            onEditorMount={(editor) => {
              editorRef.current = editor;
              applyRailOptions(editor, controls, language);
            }}
          />
        )}
      </div>
    </div>
  );
}
