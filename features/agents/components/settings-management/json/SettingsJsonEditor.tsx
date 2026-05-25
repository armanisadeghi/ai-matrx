"use client";

/**
 * SettingsJsonEditor — forgiving JSON editor for model settings.
 *
 *   • Uses json5 so trailing commas, comments, and unquoted keys all parse.
 *   • Live validation debounced ~200ms: the red error box updates as you
 *     type without requiring an Apply click.
 *   • Maintains a "last valid snapshot" internally so a transient syntax
 *     error mid-typing doesn't propagate to the caller.
 *   • Auto-formats (pretty-prints) on blur when the buffer parses cleanly.
 *   • The caller owns Apply/Reset — this component is a controlled editor
 *     that emits `onParse` whenever the buffer parses successfully.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import JSON5 from "json5";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { extractErrorMessage } from "@/utils/errors";

interface SettingsJsonEditorProps {
  /** Initial JSON text shown in the editor. */
  initialValue: string;
  /**
   * Called with the parsed object whenever the user's buffer successfully
   * parses (debounced). `null` when parsing fails. Fires on every keystroke
   * once validation runs.
   */
  onParse?: (parsed: Record<string, unknown> | null) => void;
  /** Called when the user clicks Apply with a valid parse. */
  onApply: (parsed: Record<string, unknown>) => void;
  /** Called when the user clicks Reset. Editor re-syncs from initialValue. */
  onReset?: () => void;
  /**
   * Called whenever the buffer's "unapplied edits" state changes. True when the
   * text differs from the last applied/synced value — i.e. the user has typed
   * changes they haven't Applied yet (which would be lost on close). Lets a
   * parent warn before discarding.
   */
  onDirtyChange?: (dirty: boolean) => void;
  placeholder?: string;
  /** Min textarea height in pixels. Ignored when `fillHeight` is set. */
  minHeight?: number;
  /** Show the Apply/Reset footer. Default true. */
  showFooter?: boolean;
  /**
   * When true, the editor grows to fill its flex parent instead of using a
   * fixed minHeight — the textarea takes all available vertical space. The
   * parent must be a flex column with a bounded height.
   */
  fillHeight?: boolean;
}

interface ParseResult {
  ok: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
  line?: number;
  column?: number;
}

// json5 errors look like: "JSON5: invalid character 'x' at 3:5"
const JSON5_LOCATION_RE = /at\s+(\d+):(\d+)/;

function parseJson5(text: string): ParseResult {
  if (text.trim() === "") {
    return { ok: true, parsed: {} };
  }
  try {
    const parsed = JSON5.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        ok: false,
        error: "Top-level value must be a JSON object (use { ... }).",
      };
    }
    return { ok: true, parsed: parsed as Record<string, unknown> };
  } catch (e) {
    const msg = extractErrorMessage(e);
    const match = msg.match(JSON5_LOCATION_RE);
    if (match) {
      return {
        ok: false,
        error: msg,
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
      };
    }
    return { ok: false, error: msg };
  }
}

export function SettingsJsonEditor({
  initialValue,
  onParse,
  onApply,
  onReset,
  onDirtyChange,
  placeholder,
  minHeight = 240,
  showFooter = true,
  fillHeight = false,
}: SettingsJsonEditorProps) {
  const [text, setText] = useState(initialValue);
  const [parseResult, setParseResult] = useState<ParseResult>({
    ok: true,
    parsed: {},
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastInitialRef = useRef(initialValue);

  // Re-sync when caller's initialValue changes (tab switch, external update).
  useEffect(() => {
    if (initialValue !== lastInitialRef.current) {
      setText(initialValue);
      lastInitialRef.current = initialValue;
      const result = parseJson5(initialValue);
      setParseResult(result);
    }
  }, [initialValue]);

  // Debounced parse on every keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = parseJson5(text);
      setParseResult(result);
      if (onParse) onParse(result.ok && result.parsed ? result.parsed : null);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, onParse]);

  // Surface "unapplied edits" to the caller: the buffer differs from the last
  // applied/synced baseline. The baseline (lastInitialRef) only changes in
  // paths that also setText (apply / reset / re-sync), so keying on `text` is
  // sufficient. Read the ref inside the effect — never during render.
  useEffect(() => {
    onDirtyChange?.(text !== lastInitialRef.current);
  }, [text, onDirtyChange]);

  const handleBlur = useCallback(() => {
    // Pretty-print on blur if the buffer parses cleanly. Use native JSON.stringify
    // on the parsed object so output is canonical JSON (not JSON5).
    const result = parseJson5(text);
    if (result.ok && result.parsed) {
      const formatted = JSON.stringify(result.parsed, null, 2);
      if (formatted !== text) setText(formatted);
    }
  }, [text]);

  const handleApply = useCallback(() => {
    const result = parseJson5(text);
    setParseResult(result);
    if (result.ok && result.parsed) {
      // Canonicalize the buffer and adopt it as the new baseline so the editor
      // immediately reads as "clean" (not dirty) after a successful apply, even
      // if the parent doesn't push a fresh initialValue back down.
      const formatted = JSON.stringify(result.parsed, null, 2);
      setText(formatted);
      lastInitialRef.current = formatted;
      onApply(result.parsed);
    }
  }, [text, onApply]);

  const handleReset = useCallback(() => {
    setText(lastInitialRef.current);
    const result = parseJson5(lastInitialRef.current);
    setParseResult(result);
    onReset?.();
  }, [onReset]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab inserts two spaces instead of jumping focus.
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const next = text.slice(0, start) + "  " + text.slice(end);
        setText(next);
        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        });
      }
      // Cmd/Ctrl+Enter → Apply.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
    },
    [text, handleApply],
  );

  // The shared Textarea wraps the <textarea> in a (block) focus-ring div, so a
  // bare flex-1 on the textarea won't fill. Passing `h-full` makes the wrapper
  // auto-stretch (see textarea.tsx); we nest it in its own flex-1 box so it
  // fills the space ABOVE the footer rather than overlapping it.
  const textareaEl = (
    <Textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={
        placeholder ??
        '{"temperature": 0.7, "max_output_tokens": 1024} — trailing commas and // comments OK'
      }
      className={`font-mono text-xs leading-5 ${fillHeight ? "h-full" : "resize-y"}`}
      style={{ minHeight: fillHeight ? undefined : minHeight, fontSize: "14px" }}
      spellCheck={false}
    />
  );

  return (
    <div
      className={`flex flex-col gap-2${fillHeight ? " flex-1 min-h-0" : ""}`}
    >
      {fillHeight ? (
        <div className="flex-1 min-h-0">{textareaEl}</div>
      ) : (
        textareaEl
      )}

      {!parseResult.ok && parseResult.error && (
        <div className="flex items-start gap-2 px-3 py-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold">
              Parse error
              {parseResult.line !== undefined &&
                parseResult.column !== undefined && (
                  <span className="font-mono">
                    {" "}
                    (line {parseResult.line}, col {parseResult.column})
                  </span>
                )}
            </div>
            <div className="mt-0.5 font-mono break-words">
              {parseResult.error}
            </div>
          </div>
        </div>
      )}

      {showFooter && (
        <div className="flex items-center gap-2 justify-end">
          <span className="text-[11px] text-muted-foreground mr-auto">
            Trailing commas, comments, and unquoted keys all OK · ⌘+Enter to
            apply
          </span>
          {onReset && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-7 text-xs"
            >
              Reset
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={!parseResult.ok}
            className="h-7 text-xs"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
