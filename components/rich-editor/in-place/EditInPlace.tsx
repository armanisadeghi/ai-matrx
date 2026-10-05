"use client";

// components/rich-editor/in-place/EditInPlace.tsx
//
// EDIT IN PLACE — THE primitive for rich content a person can edit. Wherever
// rendered rich content is shown AND the person has edit rights, the host
// wraps its rendered view in <EditInPlace>: a double-click on the text (or the
// host's own Edit in its bar / ⋯ menu, through `editing` + `onEditingChange`)
// swaps the rendered view for THE ONE editor in the same place and width, the
// caret where they clicked. `canEdit={false}` (someone else's record) renders
// the children untouched — read-only content never offers it.
//
// Census + guard: components/rich-editor/__tests__/edit-in-place-hosts.census.test.ts.

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { caretContextAt, domPointAt, type CaretContext } from "../core/caret-context";
import { InPlaceEditor, type InPlaceEditorProps } from "./InPlaceEditor";

/** Clicks on these never open the editor (they do their own thing). */
const INTERACTIVE = "a, button, input, textarea, select, label, summary, [role='button'], [contenteditable], [data-edit-in-place-ignore]";

export interface InPlaceOpening {
  caret: CaretContext | null;
  /** The rendered view's height when it was swapped out. */
  height: number;
}

/**
 * The double-click half, for hosts that keep their own swap (the AI answer).
 * Spread `readProps` on the element that holds the rendered text.
 */
export function useInPlaceTrigger({ canEdit, onOpen }: { canEdit: boolean; onOpen: (opening: InPlaceOpening) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canEdit || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(INTERACTIVE)) return;
    const root = ref.current;
    if (!root) return;
    const point = domPointAt(document, event.clientX, event.clientY);
    const caret = point ? caretContextAt(root, point.node, point.offset) : null;
    // The browser selected the clicked word; the editor takes over from here.
    window.getSelection()?.removeAllRanges();
    onOpen({ caret, height: root.getBoundingClientRect().height });
  };
  return {
    readProps: canEdit
      ? { ref, onDoubleClick, "data-edit-in-place": "read" as const }
      : { ref, "data-edit-in-place": "off" as const },
  };
}

export interface EditInPlaceProps extends Omit<InPlaceEditorProps, "value" | "close" | "caret" | "minHeight"> {
  /** The stored text. */
  value: string;
  /** False for content the person cannot edit: the children render as they are. */
  canEdit: boolean;
  /** The rendered view. */
  children: ReactNode;
  /** Controlled editing (the host's Edit button). Omit to let double-click own it. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  readClassName?: string;
}

export function EditInPlace({
  value,
  canEdit,
  children,
  editing: editingProp,
  onEditingChange,
  readClassName,
  ...editorProps
}: EditInPlaceProps) {
  const [editingState, setEditingState] = useState(false);
  const editing = canEdit && (editingProp ?? editingState);
  const [opening, setOpening] = useState<InPlaceOpening | null>(null);
  const setEditing = (next: boolean) => {
    if (editingProp === undefined) setEditingState(next);
    onEditingChange?.(next);
  };
  const { readProps } = useInPlaceTrigger({
    canEdit,
    onOpen: (o) => {
      setOpening(o);
      setEditing(true);
    },
  });
  // The host's Edit button opens without a double-click: the last measured
  // height of the rendered view still keeps the editor from shrinking.
  const lastHeight = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!editing && readProps.ref.current) lastHeight.current = readProps.ref.current.getBoundingClientRect().height;
  });

  if (editing) {
    return (
      <InPlaceEditor
        {...editorProps}
        value={value}
        caret={opening?.caret ?? null}
        minHeight={opening?.height ?? lastHeight.current}
        close={() => {
          setOpening(null);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div {...readProps} className={cn(canEdit && "cursor-text", readClassName)}>
      {children}
    </div>
  );
}
