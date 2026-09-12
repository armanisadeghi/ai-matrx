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
 * `XMLHttpRequest` and `fetch`. That is the whole app inside the sandbox,
 * which is the opposite of a sandbox.
 *
 * And the Groomer genuinely cannot RUN here: it opens a draggable window in
 * the host page's own layout, and a frame can only paint its own box
 * (plan §1.8).
 *
 * WHAT S2 CHANGED (chair ruling 7). Opening it no longer dead-ends. The
 * request is RELAYED to the host page through the ONE action bridge
 * (`matrx:sandbox:action` → `runAction`) — the same door the component's own
 * actions use — so the window opens where windows live. The frame gains no
 * capability and there is no second door.
 *
 * NOTHING SILENT (Law 4): while the request is in flight this says so, and if
 * the host refuses (no handler registered, or the host said no) it shows the
 * host's own sentence. It never pretends the window opened.
 */
import React from "react";
import { HOST_RELAY_ACTION_KEYS } from "../protocol";
import { requestHostAction } from "./host-action-relay";

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
    const [status, setStatus] = React.useState<
        { state: "idle" } | { state: "sending" } | { state: "failed"; message: string }
    >({ state: "idle" });

    React.useEffect(() => {
        if (!open || !config) {
            setStatus({ state: "idle" });
            return;
        }
        let live = true;
        setStatus({ state: "sending" });
        void requestHostAction(HOST_RELAY_ACTION_KEYS.groomWithAgent, {
            config,
        }).then((result) => {
            if (!live) return;
            if (result.ok) {
                // The window opened in the host page; this frame has nothing
                // left to show, and the caller's own state closes the menu.
                setStatus({ state: "idle" });
                onClose();
                return;
            }
            setStatus({
                state: "failed",
                message:
                    result.error ??
                    "The page could not open the grooming window, and gave no reason.",
            });
        });
        return () => {
            live = false;
        };
    }, [open, config, onClose]);

    if (!open || !config) return null;

    if (status.state === "failed") {
        return (
            <div
                role="alert"
                className="matrx-sandbox-error"
                data-matrx-sandbox-unavailable="agent-copy-groomer"
            >
                <strong>Grooming this copy with an agent did not start.</strong>
                <span>{status.message}</span>
                <button type="button" onClick={onClose}>
                    Close
                </button>
            </div>
        );
    }

    return (
        <div
            role="status"
            className="matrx-sandbox-error"
            data-matrx-sandbox-relay="agent-copy-groomer"
        >
            <strong>Opening the grooming window in the main page…</strong>
            <span>
                This component renders inside the Shape sandbox, so the agent
                window opens outside it.
            </span>
        </div>
    );
}

export default AgentCopyGroomerHost;
