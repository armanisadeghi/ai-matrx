/**
 * entry — the kind sandbox FRAME RUNTIME.
 *
 * This is the whole of what runs inside the `/kind-sandbox` iframe. It is
 * bundled to `public/kind-sandbox.js` by `build-kind-sandbox.ts` and loaded as
 * one cacheable script, because the frame's CSP is `connect-src 'none'` and
 * therefore nothing can be fetched at runtime.
 *
 * WHAT IS DELIBERATELY ABSENT:
 *  - no `window.top`, no `parent`, no reference to another document of any
 *    kind. S2 added the host protocol, and it is a TRANSFERRED MessagePort
 *    (`frame-bridge.ts`): the host posts one init message carrying the port,
 *    the frame checks `event.origin`, takes the port and drops its window
 *    listener. The global below still exists and is still what the bare-HTML
 *    acceptance harness drives.
 *  - no network of any kind. Nothing in this bundle may reach `fetch`,
 *    `XMLHttpRequest`, `WebSocket` or `EventSource`; the build script greps
 *    its own output and FAILS if one appears (that is the real guard, not this
 *    comment).
 *
 * The global is versioned so the host can refuse a stale artifact rather than
 * silently rendering with the wrong contract.
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { executeKindBody } from "./execute-kind-body";
import { frameRefusals, installFrameBridge } from "./frame-bridge";
import type { SandboxBodyPayload } from "../transform/transform-kind-body";

/** Bumped whenever the mount contract changes. The host asserts on it. */
export const SANDBOX_RUNTIME_VERSION = 1;

export interface SandboxMountOptions {
    /** Props handed to the component: `data`, `kind`, `config`, `uiOptions`… */
    props?: Record<string, unknown>;
    /** CSS custom properties copied from the host document's `:root`. */
    themeTokens?: Record<string, string>;
    /** `dark` adds the class the app's `@custom-variant dark` keys off. */
    colorScheme?: "light" | "dark";
    /** Called with a human sentence whenever the component fails. */
    onError?: (message: string) => void;
}

export interface SandboxHandle {
    /** Re-render with new props. */
    update(props: Record<string, unknown>): void;
    /** Re-apply theme tokens (host theme change). */
    setTheme(tokens: Record<string, string>, colorScheme?: "light" | "dark"): void;
    /** Tear the React root down. */
    unmount(): void;
}

interface BoundaryProps {
    onError?: (message: string) => void;
    children: React.ReactNode;
}

/**
 * Law 4: a component that throws shows WHAT failed, never an empty box. The
 * host relays the same sentence to the incident queue in S2.
 */
class FrameErrorBoundary extends React.Component<
    BoundaryProps,
    { message: string | null }
> {
    constructor(props: BoundaryProps) {
        super(props);
        this.state = { message: null };
    }

    static getDerivedStateFromError(error: unknown) {
        return {
            message:
                error instanceof Error
                    ? error.message
                    : "This component threw a value that is not an error.",
        };
    }

    override componentDidCatch(error: unknown) {
        const message =
            error instanceof Error ? error.message : String(error);
        this.props.onError?.(message);
    }

    override render() {
        if (this.state.message !== null) {
            return (
                <div
                    className="matrx-sandbox-error"
                    role="alert"
                    data-matrx-sandbox-error="render"
                >
                    <strong>This component could not render.</strong>
                    <span>{this.state.message}</span>
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * Put the host's resolved look onto this document's `:root` (S3).
 *
 * The frame links the stylesheet the app itself was built from, so the token
 * DEFAULTS are already right; what cannot cross a document boundary on its own
 * is (a) which of light/dark the reader is in and (b) any value the host
 * resolved at runtime — an organization theme, a user accent. Both arrive here
 * and are written as inline custom properties, which outrank the sheet's own
 * `@layer base` declarations, so a framed component resolves every
 * `hsl(var(--…))` to the same string the unframed one does.
 *
 * `color-scheme` is set too: it is what makes the browser's own widgets (form
 * controls, scrollbars, the default caret) match the theme. Without it a dark
 * page would show light-chrome inputs inside the frame and nowhere else.
 */
function applyTheme(
    tokens: Record<string, string> | undefined,
    colorScheme: "light" | "dark" | undefined,
): void {
    const root = document.documentElement;
    if (tokens) {
        for (const [name, value] of Object.entries(tokens)) {
            if (!name.startsWith("--")) continue;
            if (typeof value !== "string") continue;
            root.style.setProperty(name, value);
        }
    }
    if (colorScheme === "dark") {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
    } else if (colorScheme === "light") {
        root.classList.remove("dark");
        root.style.colorScheme = "light";
    }
}

function renderFailure(
    root: Root,
    message: string,
    onError?: (message: string) => void,
): SandboxHandle {
    onError?.(message);
    root.render(
        <div
            className="matrx-sandbox-error"
            role="alert"
            data-matrx-sandbox-error="compile"
        >
            <strong>This component could not be prepared.</strong>
            <span>{message}</span>
        </div>,
    );
    return {
        update() {
            /* nothing to update — the failure is terminal for this payload */
        },
        setTheme(tokens, colorScheme) {
            applyTheme(tokens, colorScheme);
        },
        unmount() {
            root.unmount();
        },
    };
}

/**
 * Compile and mount one organization-authored component into `container`.
 * Never throws — every failure path renders a named message instead.
 */
export function mountKindComponent(
    container: HTMLElement,
    payload: SandboxBodyPayload,
    options: SandboxMountOptions = {},
): SandboxHandle {
    applyTheme(options.themeTokens, options.colorScheme);

    const root = createRoot(container);
    const { Component, error } = executeKindBody(payload);

    if (!Component) {
        return renderFailure(
            root,
            error ?? "The component could not be compiled inside the sandbox.",
            options.onError,
        );
    }

    let props = options.props ?? {};

    const paint = () => {
        root.render(
            <FrameErrorBoundary onError={options.onError}>
                <Component {...props} />
            </FrameErrorBoundary>,
        );
    };

    paint();

    return {
        update(next) {
            props = next ?? {};
            paint();
        },
        setTheme(tokens, colorScheme) {
            applyTheme(tokens, colorScheme);
        },
        unmount() {
            root.unmount();
        },
    };
}

export interface MatrxKindSandboxGlobal {
    version: number;
    mount: typeof mountKindComponent;
    applyTheme: typeof applyTheme;
    /** Named refusals the bridge has counted (acceptance + support). */
    refusals: typeof frameRefusals;
}

const api: MatrxKindSandboxGlobal = {
    version: SANDBOX_RUNTIME_VERSION,
    mount: mountKindComponent,
    applyTheme,
    refusals: frameRefusals,
};

// S2: open the ONE door to the host page. Harmless in the bare harness — with
// no host there is no init message and nothing ever arrives.
installFrameBridge(mountKindComponent);

// The frame's only entry point. `globalThis` (not `window`) so nothing in this
// bundle names a cross-document object.
(globalThis as unknown as { MatrxKindSandbox: MatrxKindSandboxGlobal })
    .MatrxKindSandbox = api;

export default api;
