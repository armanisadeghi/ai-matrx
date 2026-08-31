"use client";

// NoteOutlinePanel — floating, draggable document outline for the active note.
//
// A page-local WindowPanel (inline close binding — no overlay slice entry, no
// persistence) rendered by NoteContentEditor when the per-instance
// `outlineOpen` flag is set. It parses the live editor buffer's markdown
// headings (debounced — never per keystroke; freeze-loop doctrine) and each
// row jumps the editor to that section:
//   - plain/split → measure the heading's offset in the textarea via a
//     transient mirror (utils/textareaMeasure) and set scrollTop (split's
//     syncScroll then carries the preview pane along);
//   - preview → scroll the preview container to the matching rendered h1–h6;
//   - wysiwyg / markdown-split (TUI) → scrollIntoView on the matching heading
//     inside the editor root.
// Free-form drag/resize come from WindowPanel; the header adds two one-click
// shape presets (compact / tall) via updateWindowRect.
//
// IMPORTANT: this file must stay behind the `dynamic({ ssr: false })` boundary
// in NoteContentEditor — it imports WindowPanel (bundle invariant).

import React, { useCallback, useMemo } from "react";
import { Heading1, RectangleHorizontal, RectangleVertical } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateWindowRect,
  selectWindowRect,
} from "@/lib/redux/slices/windowManagerSlice";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { parseNoteOutline, type NoteOutlineItem } from "../utils/noteOutline";
import { measureTextareaCharTop } from "../utils/textareaMeasure";
import type { EditorMode } from "./NoteEditorCore";

/** Debounce before re-parsing the outline while the user types. */
const OUTLINE_PARSE_DEBOUNCE_MS = 400;
/** Padding above a jumped-to heading so it doesn't sit flush at the top. */
const JUMP_TOP_PAD_PX = 12;

const SHAPE_PRESETS = {
  compact: { width: 240, height: 300 },
  tall: { width: 260, height: 620 },
} as const;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

interface NoteOutlinePanelProps {
  instanceId: string;
  noteId: string;
  /** Live editor buffer (NoteContentEditor's localContent). */
  content: string;
  editorMode: EditorMode;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Root of the editor body — heading lookup for the TUI modes. */
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/** Find the rendered heading element for an outline item inside `root`. */
function findRenderedHeading(
  root: HTMLElement,
  item: NoteOutlineItem,
): HTMLElement | null {
  // Visible elements only — the TUI editor keeps a full hidden twin of the
  // document (markdown + wysiwyg panes), and scrolling a hidden node's
  // ancestor is a silent no-op.
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
  onClose,
}: NoteOutlinePanelProps) {
  const dispatch = useAppDispatch();
  const windowId = `note-outline-${instanceId}`;
  const rect = useAppSelector(selectWindowRect(windowId));

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

  const applyShape = useCallback(
    (preset: keyof typeof SHAPE_PRESETS) => {
      dispatch(
        updateWindowRect({ id: windowId, rect: SHAPE_PRESETS[preset] }),
      );
    },
    [dispatch, windowId],
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

      // preview → the preview container; wysiwyg / markdown-split → the TUI
      // editor's rendered document inside the editor root. Both paths find the
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
    [editorMode, textareaRef, previewContainerRef, editorRootRef],
  );

  return (
    <WindowPanel
      id={windowId}
      onClose={onClose}
      title="Outline"
      width={SHAPE_PRESETS.compact.width}
      height={SHAPE_PRESETS.compact.height}
      minWidth={180}
      minHeight={140}
      position="top-right"
      mobilePresentationOverride="drawer"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Compact shape"
            aria-label="Compact shape"
            onClick={() => applyShape("compact")}
            className={cn(
              "flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              rect &&
                rect.height <= SHAPE_PRESETS.compact.height &&
                "text-foreground",
            )}
          >
            <RectangleHorizontal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Tall shape"
            aria-label="Tall shape"
            onClick={() => applyShape("tall")}
            className={cn(
              "flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              rect &&
                rect.height >= SHAPE_PRESETS.tall.height &&
                "text-foreground",
            )}
          >
            <RectangleVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
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
    </WindowPanel>
  );
}

export default NoteOutlinePanel;
