// components/official/pro-textarea-editor.ts
//
// The ONE seam that lets ProTextarea host an editor other than a <textarea>
// while keeping its whole field toolbar — mic/dictation, the "…" menu (copy,
// clean up, help with this, custom agent, the page's bound agents), text
// stats and the right-click menu. Every toolbar feature reads and writes the
// field through this handle instead of the textarea element, so there is one
// toolbar for every text field and never a copy.
//
// First consumer: `components/merge-field-input/MergeFieldInput.tsx` (merge
// fields shown as chips over the exact stored text).

import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";

export interface ProTextareaEditorHandle {
  /** The field's exact stored text. */
  getValue(): string;
  /** Selection in stored-text offsets. */
  getSelection(): { start: number; end: number };
  /** Replace the whole text through the editor's own change path (and its undo history). */
  write(next: string): boolean;
  focus(): void;
}

/** What ProTextarea hands the editor so it wears the field's surface and layout. */
export interface ProTextareaEditorRenderProps {
  id?: string;
  className: string;
  style?: CSSProperties;
  placeholder?: string;
  disabled?: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface ProTextareaEditorSlot {
  handle: RefObject<ProTextareaEditorHandle | null>;
  /** A one-line editor: the toolbar sits in a right gutter, not a row below. */
  singleLine?: boolean;
  render: (props: ProTextareaEditorRenderProps) => ReactNode;
}
