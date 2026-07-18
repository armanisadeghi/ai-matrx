"use client";

/**
 * KindHtmlFrame — the html/js flavor of a DB kind component (the user's
 * OPTION for `config.flavor='html'`, not a trust tier).
 *
 * `component_source` is a full HTML document rendered via the IframeArtifact
 * srcDoc pattern: `sandbox="allow-scripts allow-forms"` and NEVER
 * `allow-same-origin` — a srcDoc document inherits the PARENT origin, so
 * combining the two would let the page script aimatrx.com (see
 * features/canvas/artifact-types/renderers/IframeArtifact.tsx).
 *
 * Kind-data injection — BOTH documented channels, so authors can pick:
 *  1. Serialized JSON slot: a `<script type="application/json"
 *     id="matrx-kind-data">` element appended to the document. Read it with
 *     `JSON.parse(document.getElementById("matrx-kind-data").textContent)`.
 *     The payload is `{ kind, data }`.
 *  2. postMessage: on iframe load the parent posts
 *     `{ type: "matrx:kind-data", kind, data }`. (targetOrigin "*" — a
 *     srcDoc frame's origin is opaque/"null"; the data is the viewer's own
 *     kind instance, already on their page.)
 */

import React, { useMemo, useRef } from "react";

export interface KindHtmlFrameProps {
  kind: string;
  /** The row's component_source: a full HTML document. */
  html: string;
  /** The kind instance value (post-props_transform). */
  data: unknown;
  title?: string;
  className?: string;
}

/** `</script>`-safe JSON serialization for inline embedding. */
function safeInlineJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const KindHtmlFrame: React.FC<KindHtmlFrameProps> = ({
  kind,
  html,
  data,
  title,
  className,
}) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const srcDoc = useMemo(() => {
    const payload = safeInlineJson({ kind, data });
    // Appended AFTER the document: browsers relocate trailing elements into
    // <body>, so the slot is readable regardless of how the author closed
    // their document. Channel 1 of the injection contract.
    return `${html}\n<script type="application/json" id="matrx-kind-data">${payload}</script>`;
  }, [html, kind, data]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={srcDoc}
      // NO allow-same-origin (parent-origin inheritance — XSS). See header.
      sandbox="allow-scripts allow-forms"
      className={className ?? "w-full rounded-md border border-border"}
      style={{ minHeight: "300px", height: "400px" }}
      title={title ?? `${kind} component`}
      onLoad={() => {
        // Channel 2 of the injection contract.
        frameRef.current?.contentWindow?.postMessage(
          { type: "matrx:kind-data", kind, data },
          "*",
        );
      }}
    />
  );
};
