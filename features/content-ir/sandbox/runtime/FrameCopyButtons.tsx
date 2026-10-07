/**
 * Frame CopyButtons seam: THE package menu (`MatrxCopyMenu`), never a
 * hand-rolled look-alike. A shape renders the same copy control in the sandbox
 * frame as in the page — the icon trigger, the palette, Copy for AI, the
 * export list. Only the parts that reach the host app are left out here: the
 * page's rich-text copy (the frame copies plain text through the kit's one
 * clipboard door) and Send to Sheet (no host runtime in the frame).
 *
 * 2026-10-07: a text "Copy" button with a bare list replaced the real menu in
 * the frame for a day and every framed shape looked broken. Guard:
 * __tests__/frame-copy-buttons-is-the-package-menu.test.ts.
 */
"use client";

import {
  MatrxCopyMenu,
  type MatrxCopyMenuProps,
} from "@ai-matrx/alchemy/react";

export type CopyButtonsProps = MatrxCopyMenuProps;

export function CopyButtons(props: CopyButtonsProps) {
  const { sendToSheet: _noSheet, ...rest } = props as CopyButtonsProps & { sendToSheet?: unknown };
  return <MatrxCopyMenu {...rest} />;
}
