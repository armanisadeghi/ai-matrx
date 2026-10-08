// features/spaces/editor/aria-hidden-marks.ts — a modal opening never redraws the page's blocks.
//
// Round 38 (D1, "Archive record" did nothing): every modal dialog (Radix, through the `aria-hidden` package's
// `hideOthers`) marks the page outside it `aria-hidden` — and it KEEPS every `[aria-live]` element on the page,
// walking down to it and marking each sibling on the way. A database block's table carries one (dnd-kit's live
// region), so the walk went INTO the editor and wrote `aria-hidden` / `data-aria-hidden` onto the editor's own
// block elements. ProseMirror reads any attribute change on a node it drew as a foreign edit and redraws that
// block, and a redrawn database block is a new node view: the table under it remounts and every dialog it had
// open — the row menu's Archive confirm — is gone ~150 ms after it opened. Any `[aria-live]` inside a block
// (a form view's thank-you, a status line) does the same.
//
// These two attributes are accessibility state written from outside the document, never content: the editor
// ignores them. ProseMirror has no public hook for this (`ignoreMutation` is per node view, and BlockNote owns the
// block container's), so the plugin view wraps the view's DOM observer once.

import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const OUTSIDE_MARKS = new Set(["aria-hidden", "data-aria-hidden"]);

/** Whether a mutation is only a modal's accessibility mark on the editor's DOM. */
export function isOutsideAriaMark(mutation: { type: string; attributeName?: string | null }): boolean {
  return mutation.type === "attributes" && !!mutation.attributeName && OUTSIDE_MARKS.has(mutation.attributeName);
}

type ObservedView = EditorView & {
  domObserver?: { registerMutation?: (mutation: MutationRecord, added: Node[]) => unknown; __spacesAriaMarks?: true };
};

/** Make `view` ignore modal accessibility marks on its DOM. Says so loudly if ProseMirror's observer moved. */
export function ignoreOutsideAriaMarks(view: EditorView): void {
  const observer = (view as ObservedView).domObserver;
  if (!observer || observer.__spacesAriaMarks) return;
  const register = observer.registerMutation;
  if (typeof register !== "function") {
    console.error("[spaces] ProseMirror's DOM observer has no registerMutation: a modal opening will redraw the page's blocks again (aria-hidden-marks.ts).");
    return;
  }
  observer.registerMutation = (mutation: MutationRecord, added: Node[]) => (isOutsideAriaMark(mutation) ? null : register.call(observer, mutation, added));
  observer.__spacesAriaMarks = true;
}

/** The ProseMirror plugin form, for the Spaces editor's extensions. */
export function outsideAriaMarksPlugin(): Plugin {
  return new Plugin({
    view(view) {
      ignoreOutsideAriaMarks(view);
      return {};
    },
  });
}
