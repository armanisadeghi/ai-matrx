/**
 * sandbox-harness — the ONE place the jest suites stand the two real halves of
 * the Shape sandbox protocol up against each other.
 *
 * WHAT IS REAL HERE, and it is nearly everything: the host component
 * (`KindSandboxFrame`), the frame bridge (`runtime/frame-bridge.ts`), the
 * shared validator (`sandbox/protocol.ts`), and a REAL `MessagePort` pair
 * carrying every message between them. A test that passes here is a statement
 * about the shipped message path, not about a re-implementation of it.
 *
 * WHAT IS STOOD IN FOR, and why each one is the BROWSER's job rather than our
 * code's:
 *
 *  1. `MessageChannel` — jsdom does not implement it at all (proven: `new
 *     MessageChannel()` throws `ReferenceError` under
 *     `jest-environment-jsdom@30`). Node's own `worker_threads` ports are the
 *     same object shape (`postMessage`, `onmessage`, `start`, `close`) and do
 *     a real structured clone, so the host's `new MessageChannel()` gets a
 *     real channel and the frame gets a real transferred port.
 *  2. `iframe.contentWindow` — jsdom gives the iframe an `about:blank` window
 *     that never loads `/kind-sandbox`, and it drops the transfer list on
 *     `postMessage`. The stand-in records `(data, targetOrigin, transfer)`
 *     exactly as posted; {@link deliverInit} then hands it to the frame half
 *     the way a browser would — a `message` event on the frame's window with
 *     the transferred port in `event.ports`.
 *  3. LAYOUT. jsdom has none: every `getBoundingClientRect()` is zero and
 *     `documentElement.clientWidth` is 0, which the frame bridge (correctly)
 *     refuses to measure. {@link setFrameLayout} supplies the numbers a real
 *     engine would.
 *
 * WHAT THIS CANNOT PROVE, and is therefore proven in the real-browser spec
 * (`browser/kind-sandbox.spec.ts`) instead: that the frame's origin is opaque,
 * that CSP refuses the network, that `window.top` throws, and that the frame
 * renders at all. jsdom has no CSP, no origin isolation, and no renderer.
 */
import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

import { installFrameBridge } from "../runtime/frame-bridge";
import type { SandboxBodyPayload } from "../transform/transform-kind-body";

export interface PostedToFrame {
    data: Record<string, unknown>;
    targetOrigin: string;
    transfer: unknown[];
}

/**
 * Every channel the HOST opened, newest last. `port1` is the host's end and
 * `port2` the one it transferred to the frame — so a test that needs to speak
 * as the host (a host→frame message the host would never send, e.g. one
 * addressed to another instance) posts on `port1`, and a test that speaks as
 * the frame posts on `port2`.
 */
export const hostChannels: Array<{ port1: MessagePort; port2: MessagePort }> = [];

/** Install the browser APIs jsdom lacks. Returns the undo. */
export function installBrowserStandIns(): () => void {
    const g = globalThis as Record<string, unknown>;
    const hadChannel = "MessageChannel" in g;
    const previousChannel = g.MessageChannel;
    hostChannels.length = 0;
    class RecordingMessageChannel extends NodeMessageChannel {
        constructor() {
            super();
            hostChannels.push(this as unknown as { port1: MessagePort; port2: MessagePort });
        }
    }
    g.MessageChannel = RecordingMessageChannel;

    const iframeProto = HTMLIFrameElement.prototype as unknown as Record<string, unknown>;
    const previousContentWindow = Object.getOwnPropertyDescriptor(
        iframeProto,
        "contentWindow",
    );

    return () => {
        if (!hadChannel) delete g.MessageChannel;
        else g.MessageChannel = previousChannel;
        hostChannels.length = 0;
        if (previousContentWindow) {
            Object.defineProperty(iframeProto, "contentWindow", previousContentWindow);
        }
    };
}

/**
 * Replace the iframe's `contentWindow` with a recorder. Every `postMessage`
 * the host makes lands in the returned array, transfer list intact.
 */
export function recordFramePosts(): PostedToFrame[] {
    const posted: PostedToFrame[] = [];
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        configurable: true,
        get() {
            return {
                postMessage(
                    data: Record<string, unknown>,
                    targetOrigin: string,
                    transfer: unknown[] = [],
                ) {
                    posted.push({ data, targetOrigin, transfer });
                },
            };
        },
    });
    return posted;
}

/**
 * What a browser does when the host posts `init` at the frame: raise a
 * `message` event on the FRAME's window, carrying the transferred port.
 * `origin` defaults to the origin the frame document was served from, which is
 * what the frame's own origin check compares against.
 */
export function deliverInit(
    post: PostedToFrame,
    options: { origin?: string; withPort?: boolean } = {},
): void {
    const ports =
        options.withPort === false ? [] : (post.transfer as MessagePort[]);
    window.dispatchEvent(
        new MessageEvent("message", {
            data: post.data,
            origin: options.origin ?? window.location.origin,
            ports,
        }),
    );
}

/** A layout engine's worth of numbers, for the frame bridge's self-measurement. */
export function setFrameLayout(container: HTMLElement, contentBottom: number): void {
    Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        get: () => 800,
    });
    container.getBoundingClientRect = () =>
        ({ bottom: contentBottom, top: 0, height: contentBottom, width: 800, left: 0, right: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

export interface MountRecord {
    calls: number;
    props: Array<Record<string, unknown>>;
    themes: Array<{ tokens: Record<string, string>; colorScheme?: string }>;
    unmounts: number;
    onError: ((message: string) => void) | null;
    payloads: SandboxBodyPayload[];
}

/**
 * A stand-in for `mountKindComponent` — the ONE thing the frame bridge takes
 * as a parameter. Everything the bridge does around it (the port, the props,
 * the sizing, the relay) is the real module.
 */
export function recordingMount(): { mount: never; record: MountRecord } {
    const record: MountRecord = {
        calls: 0,
        props: [],
        themes: [],
        unmounts: 0,
        onError: null,
        payloads: [],
    };
    const mount = ((
        _container: HTMLElement,
        payload: SandboxBodyPayload,
        options: {
            props?: Record<string, unknown>;
            themeTokens?: Record<string, string>;
            colorScheme?: "light" | "dark";
            onError?: (message: string) => void;
        },
    ) => {
        record.calls += 1;
        record.payloads.push(payload);
        record.props.push(options.props ?? {});
        record.onError = options.onError ?? null;
        return {
            update(next: Record<string, unknown>) {
                record.props.push(next);
            },
            setTheme(tokens: Record<string, string>, colorScheme?: "light" | "dark") {
                record.themes.push({ tokens, colorScheme });
            },
            unmount() {
                record.unmounts += 1;
            },
        };
    }) as never;
    return { mount, record };
}

/**
 * `installFrameBridge` deliberately has no uninstall — in the real frame it is
 * called once per document and the listener removes itself the moment the port
 * is adopted. In one jsdom document, though, a bridge from a test whose init
 * was REFUSED is still listening when the next test delivers its init, and it
 * would adopt that port too (the second `port.onmessage` assignment wins, so
 * the wrong bridge would answer). This wraps the one call so a test can take
 * its listener back down.
 */
export function installTrackedFrameBridge(mount: never): () => void {
    const captured: Array<EventListenerOrEventListenerObject> = [];
    const original = window.addEventListener.bind(window);
    (window as Window).addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ) => {
        if (type === "message") captured.push(listener);
        return original(type, listener as EventListener, options);
    }) as typeof window.addEventListener;
    try {
        installFrameBridge(mount);
    } finally {
        (window as Window).addEventListener = original;
    }
    return () => {
        for (const listener of captured) {
            window.removeEventListener("message", listener as EventListener);
        }
    };
}

/** Let the microtask + macrotask queues drain so a port delivers. */
export async function settle(times = 3): Promise<void> {
    for (let i = 0; i < times; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
