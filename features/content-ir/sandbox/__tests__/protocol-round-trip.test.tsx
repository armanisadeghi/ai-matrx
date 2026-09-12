/**
 * THE PROTOCOL, both halves, over a real port (DD-123 S6).
 *
 * `protocol-refusals.test.ts` asserts the shared VALIDATOR. This suite asserts
 * the two halves that use it: the host component `KindSandboxFrame` and the
 * frame's `installFrameBridge`, talking to each other over a real
 * `MessagePort` pair, with no re-implementation of either side. Read
 * `sandbox-harness.ts` for exactly what is stood in for and why (jsdom has no
 * MessageChannel, no iframe navigation, and no layout).
 *
 * Every group here was proven RED by weakening the guard it covers before it
 * was believed — the weakening, the command and the failure count are recorded
 * in the B-37 report. What jsdom CANNOT prove — the opaque origin, the CSP,
 * `window.top` throwing — is proven in `browser/kind-sandbox.spec.ts` instead,
 * and this file asserts nothing about it.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    EXPANDED_FRAME_HEIGHT_CEILING_PX,
    FRAME_HEIGHT_CEILING_PX,
    IN_FLIGHT_ACTION_CAPACITY,
    MAX_INBOUND_BYTES,
    MAX_OUTBOUND_PROPS_BYTES,
    SANDBOX_PROTOCOL_VERSION,
} from "../protocol";
import type { KindSandboxCeilings } from "@/features/content-ir/react/db-component/useKindSandboxKnob";
import { frameRefusals } from "../runtime/frame-bridge";
import {
    KindSandboxFrame,
    invalidateKindSandboxTransforms,
    kindSandboxRefusals,
    resetKindSandboxRefusals,
} from "@/features/content-ir/react/db-component/KindSandboxFrame";
import {
    deliverInit,
    hostChannels,
    installBrowserStandIns,
    recordFramePosts,
    installTrackedFrameBridge,
    recordingMount,
    setFrameLayout,
    settle,
    type MountRecord,
    type PostedToFrame,
} from "./sandbox-harness";

jest.mock(
    "@/features/content-ir/react/db-component/kindComponentIncident",
    () => ({ reportKindComponentIncident: jest.fn() }),
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reportKindComponentIncident } = require("@/features/content-ir/react/db-component/kindComponentIncident");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = `export default function Component({ data }) { return null; }`;

/**
 * The ceilings the host enforces. In the product they are resolved from the
 * settings register (`custom.sandbox_frame_height_px`,
 * `custom.sandbox_expanded_frame_height_px`, `custom.sandbox_message_bytes`);
 * the register was seeded with exactly these numbers, and the frame's own
 * copies in `protocol.ts` are the same three, so naming them from there keeps
 * one source rather than three literals.
 */
const CEILINGS: KindSandboxCeilings = {
    frameHeightPx: FRAME_HEIGHT_CEILING_PX,
    expandedFrameHeightPx: EXPANDED_FRAME_HEIGHT_CEILING_PX,
    messageBytes: MAX_INBOUND_BYTES,
};

interface Harness {
    posted: PostedToFrame[];
    record: MountRecord;
    iframe: HTMLIFrameElement;
    hostEl: HTMLElement;
    /** The FRAME's end: posting here is the frame speaking to the host. */
    port: MessagePort;
    /** The HOST's end: posting here is the host speaking to the frame. */
    hostPort: MessagePort;
    runAction: jest.Mock;
    onResolve: jest.Mock;
    root: Root;
    frameContainer: HTMLElement;
    rerender: (data: unknown) => Promise<void>;
}

let undoStandIns: (() => void) | null = null;
let live: Root[] = [];
let bridgeTeardowns: Array<() => void> = [];

beforeEach(() => {
    undoStandIns = installBrowserStandIns();
    resetKindSandboxRefusals();
    invalidateKindSandboxTransforms();
    (reportKindComponentIncident as jest.Mock).mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
    for (const root of live) {
        await act(async () => root.unmount());
    }
    live = [];
    for (const teardown of bridgeTeardowns) teardown();
    bridgeTeardowns = [];
    document.body.innerHTML = "";
    undoStandIns?.();
    undoStandIns = null;
    jest.restoreAllMocks();
});

/**
 * Render the real host, let the real frame bridge adopt the port it transfers,
 * and return both ends. `connect: false` stops before the frame adopts, for
 * the handshake refusals.
 */
async function stand(
    options: {
        connect?: boolean;
        origin?: string;
        withPort?: boolean;
        contentBottom?: number;
        runAction?: jest.Mock;
        data?: unknown;
    } = {},
): Promise<Harness> {
    const posted = recordFramePosts();
    const { mount, record } = recordingMount();

    const frameContainer = document.createElement("main");
    frameContainer.id = "root";
    document.body.appendChild(frameContainer);
    setFrameLayout(frameContainer, options.contentBottom ?? 412);

    const hostEl = document.createElement("div");
    document.body.appendChild(hostEl);
    const root = createRoot(hostEl);
    live.push(root);

    const runAction =
        options.runAction ?? jest.fn(async () => ({ ok: true, result: "ran" }));
    const onResolve = jest.fn();

    let currentData: unknown = options.data ?? { title: "first" };
    const render = (data: unknown) => (
        <KindSandboxFrame
            kind="round_trip_kind"
            resolution={
                {
                    componentKey: "round_trip_kind_card",
                    componentSource: BODY,
                    config: {},
                    updatedAt: "2026-09-12T00:00:00Z",
                } as never
            }
            data={data}
            config={{}}
            runAction={runAction as never}
            onResolve={onResolve as never}
            ceilings={CEILINGS}
        />
    );

    await act(async () => {
        root.render(render(currentData));
    });

    const iframe = hostEl.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {
        iframe.dispatchEvent(new Event("load"));
    });

    // The frame half only exists once the browser hands it the port.
    bridgeTeardowns.push(installTrackedFrameBridge(mount));
    if (options.connect !== false) {
        await act(async () => {
            deliverInit(posted[0], {
                origin: options.origin,
                withPort: options.withPort,
            });
            await settle();
        });
    }

    const port = (posted[0]?.transfer?.[0] ?? null) as MessagePort;
    const hostPort = (hostChannels.at(-1)?.port1 ?? null) as MessagePort;

    return {
        posted,
        record,
        iframe,
        hostEl,
        port,
        hostPort,
        runAction,
        onResolve,
        root,
        frameContainer,
        rerender: async (data: unknown) => {
            currentData = data;
            await act(async () => {
                root.render(render(currentData));
                await settle();
            });
        },
    };
}

function refusalText(): string {
    return [...kindSandboxRefusals().keys()].join(" | ");
}

// ─────────────────────────────────────────────────────────────────────────────
describe("the handshake: one init, one port, adopted once", () => {
    it("posts exactly one init carrying the contract and a single transferred port", async () => {
        const h = await stand();
        expect(h.posted).toHaveLength(1);
        const init = h.posted[0];
        expect(init.data.type).toBe("matrx:sandbox:init");
        expect(init.data.protocolVersion).toBe(SANDBOX_PROTOCOL_VERSION);
        expect(init.data.kind).toBe("round_trip_kind");
        expect(init.data.body).toBeTruthy();
        expect(init.transfer).toHaveLength(1);
        // The frame's origin is opaque, so "*" is the only target that reaches
        // it — the frame does the origin check, which is the half that can.
        expect(init.targetOrigin).toBe("*");
        expect(h.record.calls).toBe(1);
    });

    it("refuses an init from any origin but the one the frame was served from", async () => {
        const before = frameRefusals().count;
        const h = await stand({ origin: "https://evil.example" });
        expect(h.record.calls).toBe(0);
        expect(frameRefusals().count).toBeGreaterThan(before);
        expect(frameRefusals().last).toContain("https://evil.example");
        expect(frameRefusals().last).toContain("only accepts its host page");
    });

    it("refuses an init that carries no channel", async () => {
        const h = await stand({ withPort: false });
        expect(h.record.calls).toBe(0);
        expect(frameRefusals().last).toContain("carried no channel");
    });

    it("refuses a window message that is not an init", async () => {
        const h = await stand({ connect: false });
        bridgeTeardowns.push(installTrackedFrameBridge(recordingMount().mount));
        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: { type: "matrx:sandbox:props", instanceId: "x", props: {} },
                    origin: window.location.origin,
                }),
            );
            await settle();
        });
        expect(h.record.calls).toBe(0);
        expect(frameRefusals().last).toContain("only adopts its host through an init message");
    });

    it("adopts ONE port and then has no window ear at all: a second init changes nothing", async () => {
        const h = await stand();
        expect(h.record.calls).toBe(1);
        const hostileChannel = new MessageChannel();
        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: { ...h.posted[0].data, props: { title: "hijacked" } },
                    origin: window.location.origin,
                    ports: [hostileChannel.port2],
                }),
            );
            await settle();
        });
        // Not "refused" — never even heard. The listener was removed on adoption.
        expect(h.record.calls).toBe(1);
        expect(h.record.props.map((p) => p.data)).not.toContainEqual({ title: "hijacked" });
        hostileChannel.port1.close();
    });

    it("the HOST likewise has no window ear: a hostile window message never reaches runAction", async () => {
        const h = await stand();
        await act(async () => {
            window.postMessage(
                {
                    type: "matrx:sandbox:action",
                    instanceId: (h.posted[0].data.instanceId as string),
                    callId: "forged-1",
                    key: "exfiltrate",
                    input: {},
                },
                "*",
            );
            await settle();
        });
        expect(h.runAction).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("instance-id binding", () => {
    it("the host drops a frame message addressed to another instance, by name", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:size",
                instanceId: "someone-else",
                height: 999,
            });
            await settle();
        });
        expect(refusalText()).toContain("someone-else");
        expect(h.iframe.style.height).not.toBe("999px");
    });

    it("the frame drops a host message addressed to another instance", async () => {
        const h = await stand();
        const propsBefore = h.record.props.length;
        await act(async () => {
            h.hostPort.postMessage({
                type: "matrx:sandbox:props",
                instanceId: "someone-else",
                props: { data: { title: "not yours" } },
            });
            await settle();
        });
        expect(h.record.props).toHaveLength(propsBefore);
        expect(frameRefusals().last).toContain("someone-else");
    });

    it("the frame drops a host message of an unknown type, and names the allowlist", async () => {
        const h = await stand();
        const propsBefore = h.record.props.length;
        await act(async () => {
            h.hostPort.postMessage({
                type: "matrx:sandbox:evaluate",
                instanceId: h.posted[0].data.instanceId,
                code: "fetch('https://evil.example')",
            });
            await settle();
        });
        expect(h.record.props).toHaveLength(propsBefore);
        expect(frameRefusals().last).toContain("matrx:sandbox:evaluate");
        expect(frameRefusals().last).toContain("Only these are accepted");
    });

    it("the frame drops a host message over the 256 KB cap rather than rendering part of it", async () => {
        const h = await stand();
        const propsBefore = h.record.props.length;
        await act(async () => {
            h.hostPort.postMessage({
                type: "matrx:sandbox:props",
                instanceId: h.posted[0].data.instanceId,
                props: { data: "x".repeat(MAX_OUTBOUND_PROPS_BYTES + 1) },
            });
            await settle();
        });
        expect(h.record.props).toHaveLength(propsBefore);
        expect(frameRefusals().last).toContain("Nothing was rendered from it");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the caps", () => {
    it("the host drops a frame message over the 64 KB inbound cap", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:resolve",
                instanceId: h.posted[0].data.instanceId,
                value: "x".repeat(MAX_INBOUND_BYTES + 1),
            });
            await settle();
        });
        expect(h.onResolve).not.toHaveBeenCalled();
        expect(refusalText()).toContain(String(MAX_INBOUND_BYTES));
    });

    it("the host REFUSES TO SEND props over the 256 KB outbound cap, and says so on the screen", async () => {
        const h = await stand();
        await h.rerender({ blob: "x".repeat(MAX_OUTBOUND_PROPS_BYTES + 1) });
        const alert = h.hostEl.querySelector('[role="alert"]');
        expect(alert?.textContent ?? "").toContain(String(MAX_OUTBOUND_PROPS_BYTES));
        expect(alert?.textContent ?? "").toContain("last value it received");
        // And the frame was never handed a truncated value.
        expect(
            h.record.props.some(
                (p) => typeof (p.data as { blob?: string })?.blob === "string",
            ),
        ).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("size messages", () => {
    it("the frame measures itself on adoption and the host gives the iframe exactly that", async () => {
        const h = await stand({ contentBottom: 412 });
        await act(async () => settle());
        expect(h.iframe.style.height).toBe("412px");
    });

    it("past the ceiling the host caps the frame and the control names the REAL height", async () => {
        const h = await stand({ contentBottom: FRAME_HEIGHT_CEILING_PX + 1979 });
        await act(async () => settle());
        expect(h.iframe.style.height).toBe(`${FRAME_HEIGHT_CEILING_PX}px`);
        const text = h.hostEl.textContent ?? "";
        expect(text).toContain(String(FRAME_HEIGHT_CEILING_PX + 1979));
        expect(text).toContain("Show all");
    });

    it("a size message whose height is not a number is dropped, and the frame keeps the height it had", async () => {
        const h = await stand({ contentBottom: 412 });
        await act(async () => settle());
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:size",
                instanceId: h.posted[0].data.instanceId,
                height: "tall",
            });
            await settle();
        });
        expect(h.iframe.style.height).toBe("412px");
        expect(refusalText()).toContain("height is not a number");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("theme messages", () => {
    it("init carries the host's resolved tokens and colour scheme", async () => {
        document.documentElement.classList.add("dark");
        const h = await stand();
        expect(h.posted[0].data.colorScheme).toBe("dark");
        expect(h.posted[0].data.themeTokens).toBeTruthy();
        document.documentElement.classList.remove("dark");
    });

    it("a theme change on the host root reaches the frame's setTheme", async () => {
        const h = await stand();
        await act(async () => {
            document.documentElement.classList.add("dark");
            await settle();
        });
        expect(h.record.themes.length).toBeGreaterThan(0);
        expect(h.record.themes.at(-1)?.colorScheme).toBe("dark");
        document.documentElement.classList.remove("dark");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the action relay: the host's own runAction, exactly once", () => {
    it("relays one call, answers it, and resolves the frame's promise with the host's result", async () => {
        const h = await stand();
        const runActionProp = h.record.props[0].runAction as (
            key: string,
            input: unknown,
        ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

        let answer: unknown;
        await act(async () => {
            const promise = runActionProp("apply_surface_write", { value: 1 });
            await settle(6);
            answer = await promise;
        });

        expect(h.runAction).toHaveBeenCalledTimes(1);
        expect(h.runAction).toHaveBeenCalledWith("apply_surface_write", { value: 1 });
        expect(answer).toEqual({ ok: true, result: "ran" });
    });

    it("drops a REPLAY of an already-answered call, and runAction still ran exactly once", async () => {
        const h = await stand();
        const runActionProp = h.record.props[0].runAction as (
            key: string,
            input: unknown,
        ) => Promise<unknown>;
        await act(async () => {
            const p = runActionProp("apply_surface_write", { value: 1 });
            await settle(6);
            await p;
        });
        const instanceId = h.posted[0].data.instanceId as string;
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:action",
                instanceId,
                callId: `${instanceId}:1`,
                key: "apply_surface_write",
                input: { value: 1 },
            });
            await settle(4);
        });
        expect(h.runAction).toHaveBeenCalledTimes(1);
        expect(refusalText()).toContain("already answered");
    });

    it(`refuses the ${IN_FLIGHT_ACTION_CAPACITY + 1}th in-flight action IN THE FRAME, and never sends it`, async () => {
        const never = jest.fn(() => new Promise<never>(() => undefined));
        const h = await stand({ runAction: never as unknown as jest.Mock });
        const runActionProp = h.record.props[0].runAction as (
            key: string,
            input: unknown,
        ) => Promise<{ ok: boolean; error?: string }>;

        let lastAnswer: { ok: boolean; error?: string } | undefined;
        await act(async () => {
            for (let i = 0; i < IN_FLIGHT_ACTION_CAPACITY; i += 1) {
                void runActionProp("slow_action", { i });
            }
            await settle(6);
            const overflow = runActionProp("slow_action", { i: "over" });
            await settle(6);
            lastAnswer = await overflow;
        });

        // The frame's own ceiling fires first, so the message never leaves.
        expect(never).toHaveBeenCalledTimes(IN_FLIGHT_ACTION_CAPACITY);
        expect(lastAnswer?.ok).toBe(false);
        expect(lastAnswer?.error ?? "").toContain(String(IN_FLIGHT_ACTION_CAPACITY));
        expect(frameRefusals().last).toContain("already waiting on the page");
    });

    it(`the HOST holds the same ceiling for a frame that ignores its own — the ${
        IN_FLIGHT_ACTION_CAPACITY + 1
    }th raw action is answered with a refusal, never run`, async () => {
        const never = jest.fn(() => new Promise<never>(() => undefined));
        const h = await stand({ runAction: never as unknown as jest.Mock });
        const instanceId = h.posted[0].data.instanceId as string;
        await act(async () => {
            for (let i = 0; i <= IN_FLIGHT_ACTION_CAPACITY; i += 1) {
                h.port.postMessage({
                    type: "matrx:sandbox:action",
                    instanceId,
                    callId: `raw-${i}`,
                    key: "slow_action",
                    input: { i },
                });
            }
            await settle(8);
        });
        expect(never).toHaveBeenCalledTimes(IN_FLIGHT_ACTION_CAPACITY);
        expect(refusalText()).toContain("already running");
    });

    it("relays an unknown key honestly rather than throwing", async () => {
        const unknown = jest.fn(async () => ({
            ok: false as const,
            error: 'No action registered for "nope".',
        }));
        const h = await stand({ runAction: unknown as unknown as jest.Mock });
        const runActionProp = h.record.props[0].runAction as (
            key: string,
            input: unknown,
        ) => Promise<{ ok: boolean; error?: string }>;
        let answer: { ok: boolean; error?: string } | undefined;
        await act(async () => {
            const p = runActionProp("nope", {});
            await settle(6);
            answer = await p;
        });
        expect(answer?.ok).toBe(false);
        expect(answer?.error).toContain("No action registered");
    });

    it("carries the frame's resolve value back to the host's onResolve", async () => {
        const h = await stand();
        const onResolveProp = h.record.props[0].onResolve as (value: unknown) => void;
        await act(async () => {
            onResolveProp({ chosen: "b" });
            await settle();
        });
        expect(h.onResolve).toHaveBeenCalledWith({ chosen: "b" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("dispose", () => {
    it("unmounting the host tears the frame's React root down over the port", async () => {
        const h = await stand();
        expect(h.record.unmounts).toBe(0);
        await act(async () => {
            h.root.unmount();
            await settle();
        });
        live = live.filter((r) => r !== h.root);
        expect(h.record.unmounts).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the error relay: a frame failure files on the author's own queue", () => {
    it("relays a render throw as an incident, with the sandbox named in the sentence", async () => {
        const h = await stand();
        await act(async () => {
            h.record.onError?.("Cannot read properties of undefined (reading 'map')");
            await settle();
        });
        expect(reportKindComponentIncident).toHaveBeenCalledTimes(1);
        const incident = (reportKindComponentIncident as jest.Mock).mock.calls[0][0];
        expect(incident.kind).toBe("round_trip_kind");
        expect(incident.errorType).toBe("render_throw");
        expect(incident.message).toContain("Rendered in the Shape sandbox");
        expect(incident.message).toContain("reading 'map'");
        expect(incident.componentKey).toBe("round_trip_kind_card");
    });

    it("keeps a transform_error distinct rather than flattening every failure to one type", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:error",
                instanceId: h.posted[0].data.instanceId,
                errorType: "transform_error",
                message: "the value transform threw",
            });
            await settle();
        });
        const incident = (reportKindComponentIncident as jest.Mock).mock.calls[0][0];
        expect(incident.errorType).toBe("transform_error");
    });

    it("keeps a compile_error distinct too — the author needs to know which of the two failed", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:error",
                instanceId: h.posted[0].data.instanceId,
                errorType: "compile_error",
                message: "the component body did not compile inside the sandbox",
            });
            await settle();
        });
        const incident = (reportKindComponentIncident as jest.Mock).mock.calls[0][0];
        expect(incident.errorType).toBe("compile_error");
        expect(incident.message).toContain("did not compile");
    });

    it("maps an error type it does not recognise onto render_throw, never onto the invented one", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:error",
                instanceId: h.posted[0].data.instanceId,
                errorType: "something_new",
                message: "?",
            });
            await settle();
        });
        const incident = (reportKindComponentIncident as jest.Mock).mock.calls[0][0];
        expect(incident.errorType).toBe("render_throw");
    });

    it("drops an error message with no sentence in it", async () => {
        const h = await stand();
        await act(async () => {
            h.port.postMessage({
                type: "matrx:sandbox:error",
                instanceId: h.posted[0].data.instanceId,
            });
            await settle();
        });
        expect(reportKindComponentIncident).not.toHaveBeenCalled();
        expect(refusalText()).toContain("no sentence in it");
    });
});
