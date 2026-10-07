"use client";

// components/rich-editor/format/useTextareaFormatting.ts
//
// Wire a plain <textarea> into the ONE formatting command layer: the keyboard
// chords (⌘B, ⌘I, ⌘K, ⌘⇧X, ⌘E, ⌘⇧7/8 …) and the ONE selection toolbar's
// formatting buttons. A long-form textarea host calls this once with its
// element; ProTextarea does it for every long-form use. Guard:
// `components/rich-editor/__tests__/format-hosts.census.test.ts`.

import { useEffect } from "react";
import { useSelectionZone } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import { formatCommandForKey, keyNameOf } from "../core/markdown-format";
import { markdownFormatHost, textareaFormatTarget } from "./format-target";

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Run the chord's command on this element; true when the chord was a formatting command. */
export function handleFormatChord(el: HTMLTextAreaElement, event: KeyboardEvent): boolean {
  const command = formatCommandForKey(keyNameOf(event, isApplePlatform()));
  if (!command || el.readOnly || el.disabled) return false;
  event.preventDefault();
  textareaFormatTarget(el).run(command);
  return true;
}

export function useTextareaFormatting(element: HTMLTextAreaElement | null, enabled = true): void {
  useEffect(() => {
    if (!element || !enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      handleFormatChord(element, event);
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [element, enabled]);

  useSelectionZone(
    element,
    element && enabled ? { editable: true, host: markdownFormatHost(textareaFormatTarget(element)) } : null,
  );
}
