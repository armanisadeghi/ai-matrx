// components/selection-toolbar/selection-copy.ts
//
// Copying a SELECTION of rendered rich content (Arman, 2026-10-04). Every
// path goes through the one copy module (copy-commands.ts):
//
//   • the selection toolbar's Copy / Copy markdown / Copy text (common-actions.ts)
//   • ⌘C / Ctrl+C on a selection in rendered content: the formatted HTML the
//     person selected AND a markdown text flavor (a plain field gets markdown)
//   • ⌘⇧C / Ctrl+Shift+C: readable plain text, no markup
//
// Selections inside editable text (textarea, input, contenteditable — every
// editor) keep the browser's / editor's own copy.

import { copyRich } from "@ai-matrx/kit/clipboard";
import {
  copyRichContent,
  defaultCopyFlavor,
  markdownToReadableText,
  richCopyPlainText,
  writeClipboardFlavors,
  type CopyFlavor,
} from "@/components/agent-copy/copy-commands";
import { liveSelectionShapeText } from "./selection-shape";
import { stripOwnUtmSource } from "@/utils/url-utm";

/** The live selection's range when it lies over rendered (non-editable) content. */
export function renderedSelectionRange(): Range | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const host = range.commonAncestorContainer;
  const el = host.nodeType === 1 ? (host as Element) : host.parentElement;
  if (!el || el.closest("textarea, input, [contenteditable='true'], [contenteditable=''], .cm-editor")) return null;
  const active = document.activeElement;
  if (active && active.matches("textarea, input, [contenteditable='true']")) return null;
  return range;
}

/** The selected DOM as HTML (what the person sees, formatted), links as their author wrote them. */
export function rangeHtml(range: Range): string {
  const box = document.createElement("div");
  box.appendChild(range.cloneContents());
  for (const a of Array.from(box.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    const clean = stripOwnUtmSource(href);
    if (clean !== href) a.setAttribute("href", clean);
  }
  return box.innerHTML;
}

/**
 * The selected DOM as markdown, through THE editor's HTML → markdown converter
 * (the same one every paste uses), loaded at copy time. Falls back to the
 * shape reader (tables and lists kept) when the converter cannot run.
 */
export async function rangeMarkdown(html: string): Promise<string | null> {
  try {
    const [{ htmlToMarkdown }, { getSchema }, { createRichEditorExtensions }] = await Promise.all([
      import("@/components/rich-editor/core/html-to-markdown"),
      import("@tiptap/core"),
      import("@/components/rich-editor/core/extensions"),
    ]);
    const md = htmlToMarkdown(html, getSchema(createRichEditorExtensions()));
    return md.trim() ? md : null;
  } catch (error) {
    console.warn("[copy] the selection could not be read as markdown; copying its shape text instead:", error);
    return liveSelectionShapeText();
  }
}

/** Copy the live rendered selection in one flavor. False when there is no rendered selection. */
export async function copyRenderedSelection(flavor: CopyFlavor, fallbackText: string): Promise<boolean> {
  const range = renderedSelectionRange();
  const html = range ? rangeHtml(range) : null;
  const markdown = (html ? await rangeMarkdown(html) : null) ?? fallbackText;
  if (flavor === "default" && html) {
    // Formatted = exactly what was selected on screen; plain = the knob's flavor.
    return writeClipboardFlavors(richCopyPlainText(markdown, "default", defaultCopyFlavor()), html);
  }
  return copyRichContent(markdown, flavor, { toast: false });
}

/**
 * The keyboard half, installed once at the app root (SelectionToolbarRoot):
 * ⌘C on rendered content writes formatted HTML + a markdown text flavor;
 * ⌘⇧C writes readable plain text.
 */
export function installRichCopyKeys(): () => void {
  const onCopy = (event: ClipboardEvent) => {
    if (event.defaultPrevented || !event.clipboardData) return;
    const range = renderedSelectionRange();
    if (!range) return;
    const html = rangeHtml(range);
    // Synchronous flavors now (the event's own clipboard): the shape text keeps
    // tables and lists; the full markdown upgrade follows below.
    const quick = liveSelectionShapeText() ?? range.toString();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", quick);
    event.preventDefault();
    void rangeMarkdown(html).then(async (markdown) => {
      if (!markdown || markdown === quick) return;
      const plain = richCopyPlainText(markdown, "default", defaultCopyFlavor());
      // An upgrade of the copy already on the clipboard: when the rich write is refused the event's
      // own flavors stand (plainFallback: false never downgrades them).
      const upgraded = await copyRich({ text: plain, html }, { plainFallback: false });
      if (!upgraded) console.warn("[copy] the markdown flavor could not be added to this copy; the shape text stands");
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    if (!mod || !event.shiftKey || event.altKey || (event.code !== "KeyC" && event.key.toLowerCase() !== "c")) return;
    const range = renderedSelectionRange();
    if (!range) return;
    event.preventDefault();
    event.stopPropagation();
    const html = rangeHtml(range);
    const fallback = liveSelectionShapeText() ?? range.toString();
    // The write starts inside the key press (Safari needs the gesture); the bytes follow.
    void rangeMarkdown(html).then((markdown) => writeClipboardFlavors(markdownToReadableText(markdown ?? fallback)));
  };
  document.addEventListener("copy", onCopy);
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
