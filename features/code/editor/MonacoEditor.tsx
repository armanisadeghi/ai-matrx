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
  /** Character offset (0-based) of a 1-based line/column position. */
  getOffsetAt: (position: { lineNumber: number; column: number }) => number;
  uri: { path: string };
};

export type { StandaloneCodeEditor };

type MonacoNamespace = {
  KeyMod: { CtrlCmd: number; Shift: number };
  KeyCode: { KeyS: number; KeyL: number };
};

export interface MonacoEditorProps {
  /** Current buffer content. */
  value: string;
  /** Monaco language id, e.g. "typescript". */
  language: string;
  /** Optional Monaco path / uri — used for per-file model state. */
  path?: string;
  readOnly?: boolean;
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
  /** Tailwind class to size/position the editor. */
  className?: string;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language,
  path,
  readOnly = false,
  onChange,
  onEditorMount,
  onSave,
  onSendSelection,
  className,
}) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const isDark = useMonacoTheme();
  const editorRef = useRef<StandaloneCodeEditor | null>(null);
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

  if (!isConfigured) {
    return (
      <div
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
    <div className={"h-full w-full " + (className ?? "")}>
      <Editor
        value={value}
        language={language}
        path={path}
        theme={theme}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          readOnly,
          automaticLayout: true,
          minimap: { enabled: true, renderCharacters: false },
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
          // Right-click is handled by `CodeWorkspaceContextMenu` (Radix
          // wrapper) so users get agent shortcuts on right-click. Monaco's
          // IDE actions (Format Document, Go to Definition, etc.) remain
          // accessible via the command palette (`F1`/`Cmd+Shift+P`).
        }}
      />
    </div>
  );
};

export default MonacoEditor;
