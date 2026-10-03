"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, {
  type OnMount,
  type OnChange,
  type BeforeMount,
} from "@monaco-editor/react";
// Monaco's editor type is pulled directly from @monaco-editor/react re-exports
// where possible; the handful of shapes we need are narrowed locally.
import { configureMonaco } from "./monaco-config";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useEffectsAttached } from "@/hooks/use-is-mounted";
import { useMonacoTheme } from "./useMonacoTheme";

/** Minimal shape of the Monaco editor instance we need. Keeping this loose
 *  avoids a hard type dep on the monaco-editor package itself. */
type StandaloneCodeEditor = {
  updateOptions: (opts: Record<string, unknown>) => void;
  getValue: () => string;
  layout: () => void;
  focus: () => void;
  onDidChangeCursorPosition: (cb: (e: unknown) => void) => {
    dispose: () => void;
  };
  onDidChangeCursorSelection: (cb: (e: unknown) => void) => {
    dispose: () => void;
  };
  getPosition: () => { lineNumber: number; column: number } | null;
  addCommand: (keybinding: number, handler: () => void) => void;
  /**
   * Register an item that shows in Monaco's right-click menu (and command
   * palette). Returns a Disposable so the host can clean up on unmount.
   * `precondition` accepts Monaco context-key expressions like
   * "editorHasSelection".
   */
  addAction: (descriptor: {
    id: string;
    label: string;
    contextMenuGroupId?: string;
    contextMenuOrder?: number;
    keybindings?: number[];
    precondition?: string | null;
    run: (editor: StandaloneCodeEditor) => void | Promise<void>;
  }) => { dispose: () => void };
  /** Look up a built-in or registered action by id (e.g. formatDocument). */
  getAction: (
    id: string,
  ) => { id: string; run: () => void | Promise<void> } | null;
  getSelection: () => MonacoSelection | null;
  getModel: () => MonacoModel | null;
  /**
   * Apply edits to the buffer (e.g. agent text-replace / insert). `range` is a
   * plain `IRange` (the four 1-based line/column fields). Mirrors Monaco's
   * `IStandaloneCodeEditor.executeEdits`.
   */
  executeEdits: (
    source: string,
    edits: Array<{
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      };
      text: string;
      forceMoveMarkers?: boolean;
    }>,
  ) => boolean;
};

export type MonacoSelection = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  isEmpty: () => boolean;
};

export type MonacoModel = {
  getValueInRange: (range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }) => string;
  getLineCount: () => number;
  getLineContent: (lineNumber: number) => string;
  getLanguageId: () => string;
  /** The whole buffer as a range (for a full-text replace). */
  getFullModelRange: () => {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  /** Character offset (0-based) of a 1-based line/column position. */
  getOffsetAt: (position: { lineNumber: number; column: number }) => number;
  uri: { path: string };
};

export type { StandaloneCodeEditor };

type MonacoNamespace = {
  KeyMod: { CtrlCmd: number; Shift: number };
  KeyCode: { KeyS: number; KeyL: number };
};

export interface MonacoEditorProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Current buffer content. */
  value: string;
  /** Monaco language id, e.g. "typescript". */
  language: string;
  /** Optional Monaco path / uri — used for per-file model state. */
  path?: string;
  readOnly?: boolean;
  /**
   * Keep the Monaco model (its text AND undo history) alive when this editor
   * is disposed — on hide (a sleeping board tile) or unmount — so the next
   * editor for the same `path` reattaches it, and two editors of one `path`
   * share one buffer. Requires `path`. Without it each dispose drops the
   * model, so a shared path would blank the other editor.
   */
  keepModel?: boolean;
  onChange?: (next: string) => void;
  /** Called when the editor is mounted. Gives the host access to imperative
   *  APIs (e.g. focus, format, scroll). */
  onEditorMount?: (editor: StandaloneCodeEditor) => void;
  /** Invoked when the user hits Cmd/Ctrl+S inside the editor. Host decides
   *  what to do (route to code_files / filesystem adapter / etc). */
  onSave?: () => void;
  /** Invoked when the user hits Cmd/Ctrl+Shift+L inside the editor — host
   *  reads the current selection from the editor instance (via
   *  `onEditorMount`) and ships it to the agent as a one-off context entry. */
  onSendSelection?: () => void;
}

// This is deliberately a ref-forwarding DOM boundary. `ContextMenuTrigger`
// uses Radix Slot, which supplies its event handlers and positioning ref to
// this component. Dropping those props makes Monaco's disabled native menu
// leave a right-click with no menu at all.
export const MonacoEditor = React.forwardRef<HTMLDivElement, MonacoEditorProps>(function MonacoEditor({
  value,
  language,
  path,
  readOnly = false,
  keepModel = false,
  onChange,
  onEditorMount,
  onSave,
  onSendSelection,
  className,
  ...containerProps
}, forwardedRef) {
  const [isConfigured, setIsConfigured] = useState(false);
  const isDark = useMonacoTheme();
  const isMobile = useIsMobile();
  // `<Editor>` disposes its instance when its effects detach (React
  // `<Activity>` hidden) and never creates another when they re-attach, so a
  // hidden-then-shown editor was blank. It renders only while attached: every
  // show is a fresh `<Editor>` mount, which builds a new instance (and, with
  // `keepModel`, reattaches the same model and undo history).
  const attached = useEffectsAttached();
  const editorRef = useRef<StandaloneCodeEditor | null>(null);
  // The value a (re)created editor must show: a kept model may hold older
  // text than the host's value if the host changed while it was hidden.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  // Keep latest onSave in a ref so the keybinding always sees the fresh
  // callback without needing to re-register the command (addCommand has no
  // dispose hook that's easy to thread through).
  const onSaveRef = useRef<MonacoEditorProps["onSave"]>(onSave);
  const onSendSelectionRef =
    useRef<MonacoEditorProps["onSendSelection"]>(onSendSelection);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onSendSelectionRef.current = onSendSelection;
  }, [onSendSelection]);

  // Fire Monaco configuration exactly once per app session.
  useEffect(() => {
    let cancelled = false;
    configureMonaco().then(() => {
      if (!cancelled) setIsConfigured(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco as unknown as MonacoNamespace;
  }, []);

  const handleMount: OnMount = useCallback(
    (editor) => {
      const ed = editor as unknown as StandaloneCodeEditor;
      editorRef.current = ed;
      const model = ed.getModel();
      if (model && ed.getValue() !== valueRef.current) {
        // As an edit (not setValue) so the kept undo history stays usable.
        ed.executeEdits("host-value", [
          { range: model.getFullModelRange(), text: valueRef.current, forceMoveMarkers: true },
        ]);
      }
      const monaco = monacoRef.current;
      if (monaco) {
        ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onSaveRef.current?.();
        });
        ed.addCommand(
          monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL,
          () => {
            onSendSelectionRef.current?.();
          },
        );
      }
      onEditorMount?.(ed);
    },
    [onEditorMount],
  );

  const handleChange: OnChange = useCallback(
    (next) => {
      onChange?.(next ?? "");
    },
    [onChange],
  );

  const theme = isDark ? "vs-dark" : "vs";

  if (!isConfigured || !attached) {
    return (
      <div
        ref={forwardedRef}
        {...containerProps}
        className={
          "flex h-full w-full items-center justify-center text-xs text-neutral-500 " +
          (className ?? "")
        }
      >
        Loading editor…
      </div>
    );
  }

  return (
    <div
      ref={forwardedRef}
      {...containerProps}
      className={"h-full w-full " + (className ?? "")}
    >
      <Editor
        value={value}
        language={language}
        path={path}
        theme={theme}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        keepCurrentModel={keepModel && Boolean(path)}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: { enabled: !isMobile, renderCharacters: false },
          fontSize: 13,
          fontLigatures: true,
          fontFamily:
            'Menlo, Monaco, "JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
          scrollBeyondLastLine: false,
          renderWhitespace: "selection",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          tabSize: 2,
          insertSpaces: true,
          wordWrap: "off",
          padding: { top: 12, bottom: 12 },
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: "active",
            indentation: true,
            highlightActiveIndentation: true,
          },
          scrollbar: {
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          contextmenu: false,
          // Right-click is owned by `CodeWorkspaceContextMenu` (Radix) so
          // agent shortcuts show. Monaco IDE actions (Format, Find, …) are
          // re-exposed there via `extraSections` + the editor toolbar.
        }}
      />
    </div>
  );
});

export default MonacoEditor;
