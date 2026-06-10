"use client";

import React from "react";

interface SandboxedHtmlProps {
    /** Raw HTML to render. May be authored by another user — treat as hostile. */
    html: string;
    title?: string;
    className?: string;
    /** Frame height. Number → px; string passed through (e.g. "100%"). Default 480. */
    height?: number | string;
}

/**
 * Renders untrusted, author-supplied HTML inside a fully sandboxed iframe.
 *
 * WHY an iframe and not `dangerouslySetInnerHTML`: artifact / canvas HTML can be
 * authored by ANOTHER user (public shared canvases, the discovery feed, forked
 * or shared conversations). Injecting it with `dangerouslySetInnerHTML` runs any
 * embedded `<script>` / `onerror` in the aimatrx.com origin — stored XSS
 * (session + localStorage theft, authenticated calls to `/api/*`). A `sandbox`
 * iframe with NO `allow-scripts` and NO `allow-same-origin` still renders the
 * markup but neutralizes script execution and parent-origin access.
 *
 * Do NOT widen this sandbox for HTML artifacts. Interactive app artifacts that
 * legitimately need scripts use the `iframe` artifact type, which runs scripts
 * in a unique opaque origin (allow-scripts WITHOUT allow-same-origin) so they
 * still cannot reach the parent origin.
 */
export default function SandboxedHtml({
    html,
    title = "Content",
    className,
    height = 480,
}: SandboxedHtmlProps) {
    return (
        <iframe
            title={title}
            className={className}
            // Empty sandbox = maximum restriction: no scripts, no same-origin,
            // no forms, no popups. Renders markup only.
            sandbox=""
            srcDoc={typeof html === "string" ? html : String(html ?? "")}
            style={{
                width: "100%",
                height: typeof height === "number" ? `${height}px` : height,
                border: "0",
            }}
        />
    );
}
