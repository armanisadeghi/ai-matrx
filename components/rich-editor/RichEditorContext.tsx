"use client";

// components/rich-editor/RichEditorContext.tsx
//
// What every piece inside the editor (node views, menus, panels) needs from the
// host, in one context: the surface's declared variables, the explicit
// island-edit record the save gate reads, the image uploader, and the kind
// picker. Node views render inside Tiptap's React portals, so they see it.

import { createContext, useContext } from "react";
import type { DeclaredVariable } from "./core/variables";

export interface RichEditorContextValue {
  /** Variables the surface declares; null when it declares none (a note). */
  variables: readonly DeclaredVariable[] | null;
  /** Record that the person changed or removed this island ON PURPOSE (its own editor, its Remove). */
  approveIsland: (raw: string) => void;
  /** Upload an image and return the markdown that shows it, or null when it failed (the uploader said why). */
  uploadImage: (file: File) => Promise<string | null>;
  /** Ask the person for a kind to insert; resolves with the kind JSON's markdown, or null. */
  pickKind: () => Promise<string | null>;
  /** A new variable the person created from the {{ menu. */
  onDeclareVariable?: (name: string) => void;
  readOnly: boolean;
}

const noop = () => undefined;

export const RichEditorContext = createContext<RichEditorContextValue>({
  variables: null,
  approveIsland: noop,
  uploadImage: async () => null,
  pickKind: async () => null,
  readOnly: false,
});

export function useRichEditorContext(): RichEditorContextValue {
  return useContext(RichEditorContext);
}
