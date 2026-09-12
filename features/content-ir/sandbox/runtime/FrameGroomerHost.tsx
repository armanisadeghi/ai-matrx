/**
 * FrameGroomerHost — the sandbox frame's stand-in for
 * `@/components/agent-copy/AgentCopyGroomerHost`.
 *
 * WHY A STAND-IN EXISTS AT ALL. `CopyButtons` is an allowlisted import (it is
 * the mandated Copy / Copy-for-AI bar on every kind component), and it reaches
 * the Groomer through one `next/dynamic` front door. In the page that door is
 * a lazy chunk. In the frame there is no chunk loader and no network
 * (`connect-src 'none'`), so esbuild inlines the whole subtree — and that
 * subtree is `WindowPanel` → the window-panel registry → every feature in the
 * app: jspdf, toast-ui, codemirror, prosemirror, univer, the Supabase client.
 * Measured 2026-09-12: bundling `CopyButtons` alone costs 16.6 MB and drags in
 * `XMLHttpRequest` and `fetch`. That is the whole app inside the sandbox, which
 * is the opposite of a sandbox.
 *
 * And the Groomer genuinely CANNOT run here: it opens a draggable window in
 * the host page's own layout. A frame can only paint its own box (plan §1.8).
 * So this is not a size trick — it is the correct boundary, drawn at the seam
 * the app already built for it.
 *
 * NOTHING SILENT (Law 4). Closed, this renders exactly what the real host
 * renders: nothing. Opened, it renders a visible sentence saying the action
 * lives in the main page and is not wired through the sandbox yet. It never
 * pretends to have worked. S2's message protocol is where the open request
 * gets relayed to the parent for real.
 */
import React from "react";

export interface AgentCopyGroomerHostProps {
    open: boolean;
    config: unknown;
    onClose: () => void;
}

export function AgentCopyGroomerHost({
    open,
    config,
    onClose,
}: AgentCopyGroomerHostProps): React.ReactElement | null {
    if (!open || !config) return null;
    return (
        <div
            role="alert"
            className="matrx-sandbox-error"
            data-matrx-sandbox-unavailable="agent-copy-groomer"
        >
            <strong>
                Grooming this copy with an agent opens a window in the main
                page.
            </strong>
            <span>
                Components rendered in the Shape sandbox cannot open that window
                yet. Copy and Copy-for-AI still work here.
            </span>
            <button type="button" onClick={onClose}>
                Close
            </button>
        </div>
    );
}

export default AgentCopyGroomerHost;
