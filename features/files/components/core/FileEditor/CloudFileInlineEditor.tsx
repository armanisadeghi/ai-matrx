/**
 * features/files/components/core/FileEditor/CloudFileInlineEditor.tsx
 *
 * Inline (in-pane) Monaco editor for cloud-files. Mounts directly inside
 * the preview pane's Edit tab and is the body of the `cloud-file-editor`
 * canvas tab (a preview's Edit action) — no Sheet/Dialog wrapper; sized to
 * its parent.
 *
 * It is a VIEW of the file's one working copy in the store
 * (`CloudFilesState.workingCopies`, `useFileWorkingCopy`): the text, the
 * dirty state, the saving/saved/error state all live there, keyed by file
 * id. So any number of views of one file (two board tiles, a tile and the
 * Files page) edit one copy, and a view that is hidden and shown (a sleeping
 * board tile — React `<Activity>`), remounted, or reopened shows exactly
 * what was typed. Monaco's undo history survives too: the editor keeps its
 * model (`keepModel`), keyed by the file's path, and every view shares it.
 *
 * Saving: the Save button and Cmd/Ctrl+S save the copy as the file's next
 * version (`saveFileWorkingCopy`, the one save path). Leaving — hide,
 * unmount, switching file, `pagehide` — saves an unsaved copy once (two
 * views flushing at once still make one save), and `pagehide` also keeps the
 * unsaved text for a reload of this tab.
 */

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileWorkingCopy } from "@/features/files/hooks/useFileWorkingCopy";
import {
  workingCopyDiscarded,
  workingCopyEdited,
} from "@/features/files/redux/slice";
import {
  clearFileDraft,
  saveFileWorkingCopy,
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

/** The control rail's editor options (font size, wrap, minimap, tab size). */
function applyRailOptions(
  editor: StandaloneCodeEditor | null,
  controls: FileViewerControlsApi | null,
): void {
  if (!editor || !controls) return;
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
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { copy, loading, error: loadError } = useFileWorkingCopy(fileId);
  const controls = useFileViewerControls();
  // The live Monaco instance (a new one after every show), so rail changes
  // reach it without re-creating it.
  const editorRef = useRef<StandaloneCodeEditor | null>(null);
  useEffect(() => {
    applyRailOptions(editorRef.current, controls);
  }, [
    controls,
    controls?.editorFontSize,
    controls?.editorWordWrap,
    controls?.editorMinimap,
    controls?.editorTabSize,
  ]);

  // Leaving saves an unsaved copy once: unmount, a switch to another file,
  // and an `<Activity>` hide all run this cleanup; `pagehide` also keeps the
  // text for a reload. The copy is read from the store at that moment, so
  // the save always has the LAST text typed in any view.
  useEffect(() => {
    const flush = () => {
      void dispatch(saveFileWorkingCopy({ fileId, auto: true }));
    };
    const onPageHide = () => {
      const current = store.getState().cloudFiles.workingCopies[fileId];
      if (current && current.text !== current.baseText) {
        storeFileDraft(fileId, { text: current.text, baseVersion: current.baseVersion });
      }
      flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [fileId, dispatch, store]);

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

  const language = languageFor(file.fileName);
  const isDirty = copy !== undefined && copy.text !== copy.baseText;
  const saving = copy?.saving ?? false;
  const saveError = copy?.saveError ?? null;
  const recentlySaved =
    copy?.savedAt != null && Date.now() - copy.savedAt < 2000 && !isDirty;
  const save = () => {
    void dispatch(saveFileWorkingCopy({ fileId }));
  };
  const discard = () => {
    dispatch(workingCopyDiscarded({ fileId }));
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
      {saveError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
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
            value={copy.text}
            language={language}
            path={`cloud-file:/${fileId}`}
            keepModel
            onChange={(next) => dispatch(workingCopyEdited({ fileId, text: next }))}
            onSave={save}
            onEditorMount={(editor) => {
              editorRef.current = editor;
              applyRailOptions(editor, controls);
            }}
          />
        )}
      </div>
    </div>
  );
}
