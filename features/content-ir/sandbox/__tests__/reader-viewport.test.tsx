/**
 * S5b — THE READER'S VIEWPORT crosses the frame boundary.
 *
 * WHY THIS TEST EXISTS. An iframe is its own viewport, so inside the frame
 * `@media (max-width: 768px)` and `100vw` answer about the IFRAME ELEMENT while
 * the same component mounted into the page answers about the reader's SCREEN.
 * The app's own `app/globals.css` carries a large `@media (max-width: 768px)`
 * block, so a component in a 674 px column on a 1400 px desktop rendered
 * DESKTOP unframed and MOBILE framed — measured 2026-09-12 as the single cause
 * of all 70 "the framed render is taller" bodies in the S5 parity sweep.
 *
 * The fix is a shape, not a stylesheet edit: the host gives the IFRAME the
 * reader's viewport width and clips it to the component's real column, and the
 * frame lays the component out inside a `#root` of exactly the allotted width.
 * The four things that must stay true for that to work are the four things
 * asserted here — two on the host half, two on the frame half.
 *
 * PROVEN RED FIRST (2026-09-12), each by removing exactly the line it guards
 * and each failing exactly the assertion it belongs to, 1 failed / 4 passed:
 *   1. host: dropping `...readLayout()` from the init payload
 *   2. host: iframe `width: "100%"` instead of the reader's width
 *   3. frame: dropping `container.style.width = …` from applyAllottedWidth
 *   4. frame: swallowing the missing-width case instead of sending the sentence
 *
 * What this CANNOT prove is that the two renders then look the same — that is
 * a browser fact, and it is proven by `pnpm sweep:kind-sandbox-parity` and
 * held by `pnpm check:kind-sandbox-parity`.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

import {
    installBrowserStandIns,
    installTrackedFrameBridge,
    recordFramePosts,
    recordingMount,
    settle,
} from "./sandbox-harness";
import {
    KindSandboxFrame,
    invalidateKindSandboxTransforms,
} from "../../react/db-component/KindSandboxFrame";
import { MAX_INBOUND_BYTES, SANDBOX_PROTOCOL_VERSION, checkHostMessage } from "../protocol";

const READER_VIEWPORT = 1400;
const ALLOTTED_COLUMN = 674;

/** What the host compiles; the frame receives the transformed form. */
const SOURCE = `export default function Component({ data }) { return null; }`;
const BODY = {
    transformed: "return function C(){ return null; };",
    importBindings: [],
    declaredTopLevel: [],
    allowedImports: [],
};

/**
 * jsdom has no layout: every `clientWidth` is 0. These are the two numbers a
 * real engine would have produced for a component in a 674 px column on a
 * 1400 px desktop — the exact case the sweep measured.
 */
function installLayout(): () => void {
    const rootDescriptor = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "clientWidth",
    );
    Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        get: () => READER_VIEWPORT,
    });
    Object.defineProperty(HTMLDivElement.prototype, "clientWidth", {
        configurable: true,
        get: () => ALLOTTED_COLUMN,
    });
    return () => {
        delete (document.documentElement as unknown as Record<string, unknown>)
            .clientWidth;
        if (rootDescriptor) {
            Object.defineProperty(HTMLDivElement.prototype, "clientWidth", rootDescriptor);
        } else {
            delete (HTMLDivElement.prototype as unknown as Record<string, unknown>)
                .clientWidth;
        }
    };
}

describe("the host tells the frame about the reader's window", () => {
    let undoStandIns: (() => void) | null = null;
    let undoLayout: (() => void) | null = null;
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    beforeEach(() => {
        invalidateKindSandboxTransforms();
        undoStandIns = installBrowserStandIns();
        undoLayout = installLayout();
        container = document.createElement("div");
        document.body.append(container);
    });

    afterEach(() => {
        act(() => root?.unmount());
        root = null;
        container?.remove();
        container = null;
        undoLayout?.();
        undoLayout = null;
        undoStandIns?.();
        undoStandIns = null;
    });

    function render(): ReturnType<typeof recordFramePosts> {
        const posted = recordFramePosts();
        root = createRoot(container as HTMLDivElement);
        act(() => {
            root!.render(
                <KindSandboxFrame
                    kind="identifier_entry"
                    resolution={
                        {
                            componentKey: "identifier_entry_row",
                            componentSource: SOURCE,
                            config: null,
                            updatedAt: "2026-09-12T00:00:00Z",
                            propsTransform: null,
                        } as never
                    }
                    data={{}}
                    config={{}}
                    runAction={(() =>
                        Promise.resolve({ ok: false, error: "no action" })) as never}
                    ceilings={
                        {
                            frameHeightPx: 4000,
                            expandedFrameHeightPx: 20000,
                            messageBytes: MAX_INBOUND_BYTES,
                        } as never
                    }
                />,
            );
        });
        // The iframe's `load` is what opens the channel; jsdom fires it for
        // `about:blank`, but firing it here makes the moment explicit.
        const frame = container!.querySelector("iframe") as HTMLIFrameElement;
        act(() => {
            frame.dispatchEvent(new Event("load"));
        });
        return posted;
    }

    it("sends the reader's viewport width and the component's own column with init", () => {
        const posted = render();
        const init = posted.find((p) => p.data.type === "matrx:sandbox:init");
        expect(init).toBeDefined();
        // The reader's SCREEN — the number the host page's own media queries
        // answer against — not the width of the iframe.
        expect(init!.data.readerViewportWidth).toBe(READER_VIEWPORT);
        // And the column the component actually occupies in the page.
        expect(init!.data.contentWidth).toBe(ALLOTTED_COLUMN);
    });

    it("gives the iframe the reader's width and clips it to the column", () => {
        render();
        const frame = container!.querySelector("iframe") as HTMLIFrameElement;
        // THE MECHANISM: the frame's own viewport IS the reader's viewport, so
        // every media query and every `vw` inside it answers the same question
        // it answers in the page.
        expect(frame.style.width).toBe(`${READER_VIEWPORT}px`);
        const clip = frame.parentElement as HTMLElement;
        // …and the page never gains a horizontal scrollbar for it.
        expect(clip.style.overflow).toBe("hidden");
        expect(clip.style.minWidth).toBe("0");
    });
});

describe("the frame lays the component out at the width it was given", () => {
    let uninstall: (() => void) | null = null;
    const openChannels: NodeMessageChannel[] = [];

    afterEach(() => {
        uninstall?.();
        uninstall = null;
        for (const channel of openChannels) {
            channel.port1.close();
            channel.port2.close();
        }
        openChannels.length = 0;
        document.body.innerHTML = "";
    });

    function startFrame(init: Record<string, unknown>): {
        fromFrame: Array<Record<string, unknown>>;
        port1: MessagePort;
        mountPoint: HTMLElement;
    } {
        document.body.innerHTML = '<main id="root"></main>';
        const { mount } = recordingMount();
        uninstall = installTrackedFrameBridge(mount);
        const channel = new NodeMessageChannel();
        openChannels.push(channel);
        const fromFrame: Array<Record<string, unknown>> = [];
        const port1 = channel.port1 as unknown as MessagePort;
        port1.onmessage = (event) => {
            fromFrame.push((event as MessageEvent).data);
        };
        (port1 as unknown as { start(): void }).start();
        window.dispatchEvent(
            new MessageEvent("message", {
                data: {
                    type: "matrx:sandbox:init",
                    protocolVersion: SANDBOX_PROTOCOL_VERSION,
                    instanceId: "reader-viewport-1",
                    kind: "identifier_entry",
                    body: BODY,
                    props: { data: {}, kind: "identifier_entry", config: {}, uiOptions: {} },
                    themeTokens: {},
                    colorScheme: "light",
                    ...init,
                },
                origin: window.location.origin,
                ports: [channel.port2 as unknown as MessagePort],
            }),
        );
        return {
            fromFrame,
            port1,
            mountPoint: document.getElementById("root") as HTMLElement,
        };
    }

    it("sets the mount point to the allotted width, and re-fits it when the page says so", async () => {
        const { port1, mountPoint } = startFrame({
            readerViewportWidth: READER_VIEWPORT,
            contentWidth: ALLOTTED_COLUMN,
        });
        // The component is laid out in ITS column, inside a document whose
        // viewport is the reader's whole window.
        expect(mountPoint.style.width).toBe(`${ALLOTTED_COLUMN}px`);
        // `main` carries `max-width: 100vw` unlayered in the app's own sheet;
        // a narrower allotted width has to survive it.
        expect(mountPoint.style.maxWidth).toBe("none");

        port1.postMessage({
            type: "matrx:sandbox:layout",
            instanceId: "reader-viewport-1",
            readerViewportWidth: 900,
            contentWidth: 420,
        });
        await settle();
        expect(mountPoint.style.width).toBe("420px");
    });

    it("says so out loud when the page never told it how wide it may be", async () => {
        const { fromFrame } = startFrame({});
        await settle();
        const spoken = fromFrame.filter(
            (m) => m.type === "matrx:sandbox:error",
        ) as Array<{ message: string }>;
        expect(spoken).toHaveLength(1);
        expect(spoken[0].message).toContain("how wide it is allowed to be");
        // A sentence a reader can act on, not a code.
        expect(spoken[0].message).toContain("wider than the space it sits in");
    });
});

describe("a layout message the frame cannot trust", () => {
    it("is refused with a sentence rather than applied", () => {
        for (const bad of [
            { readerViewportWidth: 0, contentWidth: 674 },
            { readerViewportWidth: 1400, contentWidth: "674" },
            { readerViewportWidth: 1400, contentWidth: Number.NaN },
        ]) {
            const checked = checkHostMessage(
                { type: "matrx:sandbox:layout", instanceId: "i", ...bad },
                "i",
            );
            expect(checked.ok).toBe(false);
            if (checked.ok) throw new Error("unreachable");
            expect(checked.refusal).toContain("is not a positive number");
            // It names what the reader is left with — never a bare "invalid".
            expect(checked.refusal).toContain("the width it already had");
        }
    });
});
