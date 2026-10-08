"use client";

// NoteOutlinePanel — the document outline, DOCKED beside the note (Notion's
// table of contents, Docs' outline): a column inside the note's own editor
// row, so it never floats over the note, the Versions tab, or anything else.
//
// Rendered by NoteContentEditor while the per-instance `outlineOpen` flag is
// set; Escape or its × closes it. It parses the live editor buffer's markdown
// headings (debounced — never per keystroke; freeze-loop doctrine) and each
// row jumps the editor to that section:
//   - plain/split → measure the heading's offset in the textarea via a
//     transient mirror (utils/textareaMeasure) and set scrollTop (split's
//     syncScroll then carries the preview pane along);
//   - preview → scroll the preview container to the matching rendered h1–h6;
//   - write / source (the one editor) → the editor's own heading jump
//     inside the editor root.

import React, { useCallback, useEffect, useMemo } from "react";
import { Heading1, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDebounce } from "@ai-matrx/kit/hooks";
import { parseNoteOutline, type NoteOutlineItem } from "../utils/noteOutline";
import { measureTextareaCharTop } from "../utils/textareaMeasure";
import type { EditorMode } from "./NoteEditorCore";

/** Debounce before re-parsing the outline while the user types. */
const OUTLINE_PARSE_DEBOUNCE_MS = 400;
/** Padding above a jumped-to heading so it doesn't sit flush at the top. */
const JUMP_TOP_PAD_PX = 12;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

interface NoteOutlinePanelProps {
  instanceId: string;
  noteId: string;
  /** Live editor buffer (NoteContentEditor's localContent). */
  content: string;
  editorMode: EditorMode;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Root of the editor body. */
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  /** Write / Source: the one editor scrolls to the heading at this source offset. */
  onJumpInEditor?: (offset: number) => void;
  onClose: () => void;
}

/** Find the rendered heading element for an outline item inside `root`. */
function findRenderedHeading(
  root: HTMLElement,
  item: NoteOutlineItem,
): HTMLElement | null {
  // Visible elements only — scrolling a hidden node's ancestor is a silent
  // no-op.
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
  ).filter((el) => el.offsetParent !== null);
  const byIndex = headings[item.headingIndex];
  if (byIndex && (byIndex.textContent ?? "").trim() === item.text) {
    return byIndex;
  }
  return (
    headings.find((el) => (el.textContent ?? "").trim() === item.text) ??
    byIndex ??
    null
  );
}

/** Closest ancestor that actually scrolls vertically. */
function nearestScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const cs = window.getComputedStyle(node);
    if (
      /(auto|scroll)/.test(cs.overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function NoteOutlinePanel({
  instanceId,
  noteId,
  content,
  editorMode,
  textareaRef,
  previewContainerRef,
  editorRootRef,
  onJumpInEditor,
  onClose,
}: NoteOutlinePanelProps) {
  // Escape closes the outline (a dialog or menu that took the key first keeps it).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (target?.closest?.("[role='dialog'], [role='menu'], [role='listbox']")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Parse on a debounce so a fast typist never pays an O(lines) scan per
  // keystroke; the outline settling ~400ms behind the buffer is invisible.
  const settledContent = useDebounce(content, OUTLINE_PARSE_DEBOUNCE_MS);
  const outline = useMemo(
    () => parseNoteOutline(settledContent),
    [settledContent],
  );
  // Indent is relative to the shallowest heading present, so a note whose
  // headings start at ### doesn't render everything deeply indented.
  const minLevel = useMemo(
    () => outline.reduce((min, i) => Math.min(min, i.level), 6),
    [outline],
  );

  const handleJump = useCallback(
    (item: NoteOutlineItem) => {
      if (editorMode === "plain" || editorMode === "split") {
        const ta = textareaRef.current;
        if (!ta) return;
        const top = measureTextareaCharTop(ta, item.charOffset);
        if (top == null) return;
        // Programmatic scrollTop fires the scroll event, so split mode's
        // syncScroll carries the preview pane along for free.
        ta.scrollTop = Math.max(0, top - JUMP_TOP_PAD_PX);
        return;
      }

      // Write / Source: the one editor knows where its headings are (the
      // visual view by anchor, the source view by offset).
      if ((editorMode === "write" || editorMode === "source") && onJumpInEditor) {
        onJumpInEditor(item.charOffset);
        return;
      }

      // preview → the preview container (any other rich view → the editor
      // root). Both paths find the
      // rendered heading, then scroll ONLY its nearest scrollable ancestor —
      // never scrollIntoView, which cascades up and drags the page shell too.
      // Instant, not smooth: something in the preview stack cancels smooth
      // scroll animations mid-flight (verified live — a plain scrollTo sticks,
      // `behavior:"smooth"` snaps back to where it started).
      const root =
        editorMode === "preview"
          ? previewContainerRef.current
          : editorRootRef.current;
      const el = root ? findRenderedHeading(root, item) : null;
      if (!el) {
        toast.info("That section hasn't rendered yet — try again in a moment.");
        return;
      }
      const scroller = nearestScrollableAncestor(el);
      if (!scroller) return;
      const delta =
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      scroller.scrollTo({
        top: scroller.scrollTop + delta - JUMP_TOP_PAD_PX,
      });
    },
    [editorMode, textareaRef, previewContainerRef, editorRootRef, onJumpInEditor],
  );

  return (
    <aside
      aria-label="Outline"
      data-note-outline-panel={instanceId}
      className={cn(
        "flex w-56 shrink-0 flex-col border-l border-border/40 bg-background",
        // A phone-width note: the outline covers the note's right side instead of squeezing it.
        "max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-20 max-sm:w-[min(16rem,85%)] max-sm:shadow-lg",
      )}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/40 pl-3 pr-1">
        <span className="flex-1 truncate text-xs font-medium text-muted-foreground">Outline</span>
        <button
          type="button"
          aria-label="Close outline"
          title="Close (Esc)"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {outline.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <Heading1 className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No headings yet. Lines starting with{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[0.6875rem]">
              #
            </code>{" "}
            build this outline.
          </p>
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin-auto py-1"
          data-note-outline-for={noteId}
        >
          {outline.map((item) => (
            <button
              key={`${item.headingIndex}:${item.charOffset}`}
              type="button"
              onClick={() => handleJump(item)}
              title={item.text}
              className={cn(
                "block w-full cursor-pointer truncate rounded-sm px-2 py-1 text-left text-xs leading-snug text-foreground/85 transition-colors hover:bg-accent hover:text-foreground",
                item.level - minLevel >= 1 && "text-muted-foreground",
              )}
              style={{
                paddingLeft: `${8 + (item.level - minLevel) * 12}px`,
              }}
            >
              {item.text}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

export default NoteOutlinePanel;
