"use client";

// components/merge-field-input/useMergeFieldFormatting.ts
//
// Wire the merge-field editor (a contenteditable that draws `{{fields}}` as chips) into THE formatting
// command layer, the way `useTextareaFormatting` wires a <textarea>: the keyboard chords (⌘B, ⌘I, ⌘K …)
// and the ONE selection toolbar's formatting buttons run markdown text edits on the field's STORED text.
// A `{{field}}` is never inside a marker the edit could split — the edit wraps whole selections, and the
// stored text round-trips through the field's own change path (and its undo history).

import { useMemo, useEffect } from "react";
import { useSelectionZone } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import { formatCommandForKey, keyNameOf } from "@ai-matrx/rich-editor/core/markdown-format";
import { applySourceEdit } from "@ai-matrx/rich-editor/core/source-format";
import { ensureFormatActions } from "@ai-matrx/rich-editor/format/format-actions";
import { isApplePlatform } from "@ai-matrx/rich-editor/format/useTextareaFormatting";
import { markdownFormatHost, registerFormatElement, textFormatTarget } from "@ai-matrx/rich-editor/format/format-target";

export interface MergeFieldFormatApi {
  getValue: () => string;
  getSelection: () => { start: number; end: number };
  write: (next: string) => boolean;
  select: (start: number, end: number) => void;
}

export function useMergeFieldFormatting(
  element: HTMLElement | null,
  api: () => MergeFieldFormatApi | null,
  enabled: boolean,
): void {
  const target = useMemo(
    () =>
      textFormatTarget(
        "source",
        () => {
          const field = api();
          if (!field || !element) return null;
          const { start, end } = field.getSelection();
          return { text: field.getValue(), from: Math.min(start, end), to: Math.max(start, end), editable: enabled && element.isConnected };
        },
        (result, text) => {
          const field = api();
          if (!field) return;
          field.write(applySourceEdit(text, result));
          field.select(result.anchor, result.head);
        },
        (onChange) => {
          document.addEventListener("selectionchange", onChange);
          return () => document.removeEventListener("selectionchange", onChange);
        },
      ),
    // `api` reads live refs; the target follows the element only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element, enabled],
  );

  useEffect(() => {
    if (!element || !enabled) return;
    ensureFormatActions();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const command = formatCommandForKey(keyNameOf(event, isApplePlatform()));
      if (!command) return;
      event.preventDefault();
      target.run(command);
    };
    element.addEventListener("keydown", onKeyDown);
    const unregister = registerFormatElement(element, target);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      unregister();
    };
  }, [element, enabled, target]);

  useSelectionZone(element, element && enabled ? { editable: true, host: markdownFormatHost(target) } : null);
}
