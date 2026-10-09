"use client";

/**
 * useKeptRichCaret — THE ONE EDITOR (Write / Source) puts the caret back where
 * the person left it, the way `useKeptTextSelection` does for a textarea.
 *
 * Hidden and shown (a board tile asleep and awake) or REMOUNTED, the editor's
 * caret collapses to the start of the document. While the editor is up its
 * caret is tracked (the editor's own `getCaret`: text around the ends, which
 * survives the view rebuilding); when the view goes away the last caret is
 * kept under the record's working-copy key (`workingCopies.richCarets`, which
 * outlives the entry); when one comes up the caret is put back.
 *
 * The editor loads lazily and builds its view after mount, so restoring
 * retries until the editor takes it. Restoring NEVER takes focus
 * (`restoreCaret` with `focus: false`), and not at all while the person types
 * in a field elsewhere (`lib/dom/focus-guard`).
 */

import { useLayoutEffect, type RefObject } from "react";
import type { RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { useAppStore } from "@/lib/redux/hooks";
import { personIsTypingElsewhere } from "@/lib/dom/focus-guard";
import { getKeptRichCaret, workingCopyRichCaretKept, type KeptRichCaret } from "./workingCopySlice";

const TRIES = 40;
const RETRY_MS = 50;

export function useKeptRichCaret(
  key: string | null,
  controller: RefObject<RichEditorController | null>,
  root: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  const store = useAppStore();
  useLayoutEffect(() => {
    if (!key || !active) return undefined;
    let last: KeptRichCaret | null = getKeptRichCaret(store.getState(), key) ?? null;
    console.log('[RC] mount', JSON.stringify(last));
    let restored = last === null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Track the caret while the person works: only a selection inside this editor counts.
    const track = () => {
      if (!restored) return;
      const host = root.current;
      const selection = document.getSelection();
      if (!host || !selection || !selection.anchorNode || !host.contains(selection.anchorNode)) return;
      const caret = controller.current?.getCaret?.() ?? null;
      if (caret) last = caret;
    };
    document.addEventListener("selectionchange", track);

    const restore = () => {
      timer = null;
      const kept = last;
      console.log('[RC] restore try', tries, !!controller.current, JSON.stringify(kept));
      const c = controller.current;
      if (!kept) return;
      if (c && !personIsTypingElsewhere(root.current ?? undefined) && c.restoreCaret(kept, { focus: false })) {
        restored = true;
        return;
      }
      if (c && personIsTypingElsewhere(root.current ?? undefined)) {
        restored = true; // leave the person where they are typing
        return;
      }
      if (++tries <= TRIES) timer = setTimeout(restore, RETRY_MS);
      else restored = true;
    };
    if (!restored) timer = setTimeout(restore, 0);

    return () => {
      document.removeEventListener("selectionchange", track);
      if (timer) clearTimeout(timer);
      // The editor's own answer at the last moment wins when it still has one (a selection set
      // by script or touch fires no selectionchange); else the last one tracked.
      if (restored) last = controller.current?.getCaret?.() ?? last;
      console.log('[RC] cleanup', JSON.stringify(last));
      if (last) store.dispatch(workingCopyRichCaretKept({ key, caret: last }));
    };
  }, [key, active, controller, root, store]);
}
