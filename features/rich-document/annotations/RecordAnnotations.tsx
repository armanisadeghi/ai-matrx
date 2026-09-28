// features/rich-document/annotations/RecordAnnotations.tsx
//
// THE READING SET ON A SAVED RECORD — the one mount every host of saved
// content uses (RichDocument for notes and saved documents, the chat answer):
//
//   - installs the SAME annotation sidecar the study guide uses, anchored to
//     the record itself (the note, the chat message, the document), so the one
//     selection toolbar offers highlight, comment, suggest and link there;
//   - owns the Notes & comments dock, placed the Google Docs way: on desktop a
//     floating right-side panel that never pushes content (a transcript keeps
//     its width), on a phone the bottom sheet. It opens when the person makes
//     or focuses an item (Comment, Highlight, a click on a painted passage) or
//     picks "Notes & comments" in the ⋯ menu, and never opens empty by itself;
//   - holds its reads and live channel while the content is far out of view
//     (a long transcript opens channels only for what is near the screen).
//
// This file is the LIGHT shell every host imports: one plain wrapper element
// plus ONE lazy edge to the sidecar (./RecordAnnotationsImpl), taken only
// where a saved record renders. The impl attaches to this element, so the
// content is never re-parented or remounted when the reading set arrives.
// A host already inside a sidecar (the study guide, the studio's Annotate
// view) is left alone: the outer sidecar owns that text.

"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { recordKeyOf } from "./record-of-source";
import type { AnnotationSource } from "./types";

const RecordAnnotationsImpl = lazy(() => import("./RecordAnnotationsImpl"));

export function RecordAnnotations({
  record,
  children,
  className,
}: {
  record: AnnotationSource | null;
  children: ReactNode;
  /** The wrapper's own layout, for a host whose child fills a bounded flex column (an editor). */
  className?: string;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={setRoot} className={className} data-record-annotations={record ? recordKeyOf(record) : undefined}>
        {children}
      </div>
      {record && root ? (
        <Suspense fallback={null}>
          <RecordAnnotationsImpl record={record} root={root} />
        </Suspense>
      ) : null}
    </>
  );
}
