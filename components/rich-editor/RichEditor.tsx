"use client";

// components/rich-editor/RichEditor.tsx
//
// THE ONE EDITOR's front door (rich-content PLAN decisions 5, 6, 11). One
// dynamic boundary (code-splitting Method B): Tiptap, CodeMirror, marked and
// every panel load together, on the client, only where an editor is shown.
// The props type lives here so hosts import it without the implementation.
//
// Contract: the stored text is the truth. Opening, switching views and saving
// without an edit returns the stored bytes; an edit changes bytes only where
// the person typed; protected content (kinds, XML sections, code, math,
// {{variables}}, HTML, anchors) is never rewritten unless the person changes
// it in its own editor — and a save that would change it says so first.
// Docs: components/rich-editor/FEATURE.md.

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { RichEditorProps } from "./RichEditorImpl";

export type { RichEditorProps, RichEditorView } from "./RichEditorImpl";

const RichEditor = dynamic(() => import("./RichEditorImpl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Opening the editor…
    </div>
  ),
});

export default RichEditor;
