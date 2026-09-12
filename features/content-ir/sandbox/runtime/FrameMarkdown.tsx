/**
 * FrameMarkdown — the sandbox frame's own markdown renderer.
 *
 * CHAIR RULING 1 (DD-123, 2026-09-12): `@/components/MarkdownStream` cannot be
 * bundled into the frame, and there is no per-component exception that lets
 * Next internals in. Proven, not assumed: an esbuild bundle over an entry that
 * imports MarkdownStream fails with `Could not resolve "node:stream"` from
 * `next/dist/server/render-result.js` — the shell is a `next/dynamic` wrapper
 * and the implementation reaches Next server internals and Redux (plan §1.5).
 *
 * So the frame ships this instead. It is deliberately NOT a port of the rich
 * document engine: no flashcards, no tool traces, no code-surface actions, no
 * Redux, no network. It is markdown text → safe DOM, which is what the five
 * live bodies that import MarkdownStream actually pass it (`content` + a
 * `className`). The allowlist entry for every MarkdownStream path is aliased
 * to this module at bundle time (`build-kind-sandbox.ts`), so those five
 * bodies are migrated without a single database row changing.
 *
 * SAFETY, and why the renderer is part of the boundary rather than decoration:
 *  - raw HTML in the markdown is NOT rendered. `rehype-raw` is deliberately
 *    absent, so `<img onerror=...>` and `<script>` arrive as text.
 *  - every `href` and `src` goes through `safeUrl` (the render-time protocol
 *    allowlist). A refused URL renders as inert text with a visible marker —
 *    never a live link, never a silently dropped element (Law 4).
 */
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeUrl } from "./safe-url";

export interface FrameMarkdownProps {
    /** Markdown source. `children` is accepted for react-markdown parity. */
    content?: string;
    children?: string;
    className?: string;
    /**
     * Accepted and ignored — MarkdownStream's streaming flag. The frame
     * re-renders on every props message, so there is nothing to toggle.
     */
    isStreamActive?: boolean;
    /** Accepted and ignored (MarkdownStream prop-surface parity). */
    [key: string]: unknown;
}

/** Marker class the parity/screenshot pass can assert on. */
const REFUSED_CLASS = "matrx-sandbox-refused-url";

function RefusedUrl({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <span
            className={REFUSED_CLASS}
            data-matrx-refused={label}
            title={`This ${label} was blocked: only http, https, mailto and tel links are allowed inside a Shape component.`}
        >
            {children}
        </span>
    );
}

const COMPONENTS: Components = {
    a({ href, children, node: _node, ...rest }) {
        const safe = safeUrl(href, "href");
        if (safe === null) {
            return <RefusedUrl label="link">{children}</RefusedUrl>;
        }
        return (
            <a {...rest} href={safe} target="_blank" rel="noopener noreferrer nofollow">
                {children}
            </a>
        );
    },
    img({ src, alt, node: _node, ...rest }) {
        const safe = safeUrl(src, "src");
        if (safe === null) {
            return <RefusedUrl label="image">{alt || "image"}</RefusedUrl>;
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img {...rest} src={safe} alt={alt ?? ""} loading="lazy" />;
    },
};

/**
 * `urlTransform` is react-markdown's own hook for the same job. We keep it as
 * the second line of defence: the component overrides above never see a URL
 * this rejected, and a future element with a URL slot we did not override is
 * still covered.
 */
function transformUrl(url: string, key: string): string {
    const slot = key === "src" ? "src" : "href";
    return safeUrl(url, slot) ?? "";
}

export function FrameMarkdown({
    content,
    children,
    className,
}: FrameMarkdownProps): React.ReactElement {
    const source =
        typeof content === "string"
            ? content
            : typeof children === "string"
              ? children
              : "";

    return (
        <div className={className ?? "matrx-sandbox-markdown"}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                // NO rehype-raw. Raw HTML stays text — that is the point.
                urlTransform={transformUrl}
                components={COMPONENTS}
            >
                {source}
            </ReactMarkdown>
        </div>
    );
}

export default FrameMarkdown;
