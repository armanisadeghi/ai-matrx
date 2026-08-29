// features/html-pages/utils/confirm-destructive.ts
//
// The consequence-stating confirmations for the two html-pages controls that
// throw away work: "Reset All to Original" / "Reset" (wipes everything) and
// "Update from Markdown" (silently overwrites manual content.html / CSS
// edits). Both resets live on different tabs, so the text lives HERE and not
// in either component — two surfaces stating the same consequence two
// different ways is how a confirmation stops being true.
//
// Law: common-docs/policies/destructive-and-expensive-actions.md

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

type DirtyFlags = {
  isMarkdownDirty: boolean;
  isContentDirty: boolean;
};

/**
 * Gate for `actions.handleRefreshMarkdown()` — the full reset. It restores the
 * initial generated snapshot over the edited markdown AND over any manual
 * content.html / wordpress.css / metadata edits, regardless of the dirty
 * flags, with no undo.
 */
export function confirmResetToOriginal({
  isMarkdownDirty,
  isContentDirty,
}: DirtyFlags): Promise<boolean> {
  const edited: string[] = [];
  if (isMarkdownDirty) edited.push("your edited markdown");
  if (isContentDirty) edited.push("your manual content.html / CSS edits");

  const description =
    edited.length === 0
      ? "You have no unsaved edits — this restores the original generated content for every file (markdown, content.html, wordpress.css, and metadata)."
      : `Throws away ${edited.join(" and ")} and restores the originally generated content for every file — markdown, content.html, wordpress.css, and metadata. This cannot be undone.`;

  return confirm({
    title: "Reset every file to the original?",
    description,
    confirmLabel: "Reset to original",
    variant: "destructive",
  });
}

/**
 * Gate for `actions.handleUpdateFromMarkdown()` — only destructive when
 * content.html / CSS were edited by hand, because regenerating from markdown
 * overwrites those edits. Callers must skip this when `isContentDirty` is
 * false: nothing is lost then, and a dialog there is friction, not honesty.
 */
export function confirmRegenerateFromMarkdown(): Promise<boolean> {
  return confirm({
    title: "Regenerate the source files from markdown?",
    description:
      "You've manually edited content.html / wordpress.css. Regenerating rebuilds those files from the markdown, so every manual change you made in the editor is discarded and cannot be recovered.",
    confirmLabel: "Regenerate and discard my edits",
    variant: "destructive",
  });
}
