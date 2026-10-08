"use client";

// features/data-tables/records-ui-host/RecordBodyEditor.tsx — records-ui's `editRichText` port.
//
// A RECORD IS A PAGE (v7 TABLE-EXPERIENCE item 1): the body under a record's fields is written in the
// platform's ONE editor (`components/rich-editor`, the notes editor) — never a second one. Its one
// slim row carries only THE formatting toolbar (chrome "format"; editable text always has it —
// Arman, 2026-10-08); slash menu, shortcuts and the selection toolbar work too. The package owns
// the saving; this only reports every change.

import RichEditor from "@ai-matrx/rich-editor/editor/RichEditor";
import type { RichTextEditProps } from "@ai-matrx/records-ui";

export function RecordBodyEditor({ value, onChange, readOnly, placeholder }: RichTextEditProps) {
  return (
    <div className="min-h-[12rem] rounded-md text-sm" data-record-body-editor="">
      <RichEditor
        imagePolicy="self"
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        chrome="format"
        defaultView="visual"
        defaultOutlineOpen={false}
      />
    </div>
  );
}
