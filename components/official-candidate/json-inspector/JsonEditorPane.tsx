"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

import { useThemeMode } from "@/styles/themes/useThemeMode";
import { cn } from "@/lib/utils";
import { formatJson } from "@/utils/json/json-cleaner-utility";

export interface JsonEditorPaneProps {
  /** Source value rendered in the editor. Updated locally — only commits on blur. */
  value: unknown;
  /**
   * Called on blur with the parsed value when the JSON is valid. Not called
   * when invalid (errors are shown inline as red squigglies — the user fixes
   * before commit). Receives `unknown` because JSON can be anything.
   */
  onUpdate?: (next: unknown) => void;
  /** When true, editor is read-only (no edits). */
  readOnly?: boolean;
  /** Tab indent width. Defaults to 2. */
  indent?: number;
  /** Forwarded to wrapper. */
  className?: string;
}

/**
 * JSON text editor backed by CodeMirror 6.
 *
 * Behavior:
 *   - Local text state — props.value only seeds the editor and re-syncs when
 *     the editor is NOT focused (so external updates don't fight the cursor).
 *   - On change: only updates local text. Lint runs against the buffer and
 *     paints red squigglies via `@codemirror/lint`. No upward state changes,
 *     no parent re-renders, no cursor jumps.
 *   - On blur: parses the buffer once. If valid → calls `onUpdate(parsed)`.
 *     If invalid → does nothing (errors stay visible; user can keep editing
 *     or click away and come back).
 */
export function JsonEditorPane({
  value,
  onUpdate,
  readOnly = false,
  indent = 2,
  className,
}: JsonEditorPaneProps) {
  const themeMode = useThemeMode();
  const isDark = themeMode === "dark";

  // Initial / external text. Recomputed only when `value` reference changes.
  // This is the value used to seed the editor and to detect external updates.
  const externalText = useMemo(() => {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    return formatJson(value, indent);
  }, [value, indent]);

  const [text, setText] = useState<string>(externalText);
  const isFocusedRef = useRef(false);
  const lastExternalRef = useRef(externalText);

  // Sync external value into the buffer ONLY when not focused. While focused
  // we leave the buffer alone — overwriting it would steal the user's edits
  // and reset the caret to the end of the document.
  useEffect(() => {
    if (externalText === lastExternalRef.current) return;
    lastExternalRef.current = externalText;
    if (!isFocusedRef.current) setText(externalText);
  }, [externalText]);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    if (!onUpdate) return;
    const trimmed = text.trim();
    if (trimmed === "") {
      // Empty buffer — commit as null (treat as "cleared"). If the upstream
      // value was already null/undefined this is effectively a no-op.
      if (value !== null && value !== undefined) onUpdate(null);
      return;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      // Only commit if the JSON differs from the external value. We compare
      // by re-serializing both sides so key order changes don't cause needless
      // upward updates.
      const serializedParsed = formatJson(parsed, indent);
      const serializedExternal = lastExternalRef.current;
      if (serializedParsed !== serializedExternal) onUpdate(parsed);
    } catch {
      // Invalid JSON — leave the buffer untouched. Lint extension keeps the
      // red squigglies visible so the user can resume editing.
    }
  }, [text, onUpdate, indent, value]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const extensions = useMemo(
    () => [
      json(),
      linter(jsonParseLinter()),
      lintGutter(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
    ],
    [],
  );

  // Keep a ref so we can imperatively reset the buffer to the latest external
  // value (e.g. via the "Reset" button). Not strictly needed today but makes
  // future surface (toolbar) trivial to bolt on.
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  return (
    <div
      className={cn(
        "h-full flex flex-col min-h-0 overflow-hidden",
        "bg-white dark:bg-zinc-900",
        className,
      )}
    >
      <CodeMirror
        ref={cmRef}
        value={text}
        onChange={setText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        theme={isDark ? "dark" : "light"}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightSelectionMatches: false,
          autocompletion: false,
          searchKeymap: true,
          tabSize: indent,
        }}
        height="100%"
        className="flex-1 min-h-0 text-xs"
        style={{ fontSize: 12 }}
      />
    </div>
  );
}

export default JsonEditorPane;
