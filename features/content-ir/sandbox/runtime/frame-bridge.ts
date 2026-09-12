/**
 * frame-bridge — the FRAME half of the host↔sandbox protocol (DD-123 §1.6,
 * §1.7). It is the only part of the frame that talks to anything outside the
 * frame, and it does so through exactly one transferred `MessagePort`.
 *
 * WHAT IT DOES, in order:
 *  1. Listens ONCE on `window` for `matrx:sandbox:init`. It accepts that
 *     message only when `event.origin === location.origin` — the frame-side
 *     origin check — and only when it carries a port. Then it drops the window
 *     listener, so the frame has no window-level ear for the rest of its life.
 *  2. Mounts the component with the props the host sent, plus the two props
 *     the host cannot serialize: `runAction` and `onResolve`. Both are pipes
 *     over the port to the host's OWN `useKindActionRunner` — no new
 *     capability, no second door (§1.7).
 *  3. Reports its height on every layout change (`ResizeObserver`), so the
 *     host can size the iframe. The frame never scrolls itself.
 *  4. Relays every render/compile failure as `matrx:sandbox:error`, which the
 *     host files on the kind's existing incident queue.
 *
 * REFUSALS ARE NEVER SILENT (Law 4). An unknown message type, a message for
 * another instance, an oversized message, a duplicate answer to a call, or a
 * 17th in-flight action is dropped with a named sentence on the console and a
 * counter the acceptance harness reads (`__matrxSandboxRefusals`).
 *
 * WHAT IS DELIBERATELY ABSENT: `parent`, `window.top`, and any network API.
 * The build audits the served bytes for all of them and fails.
 */
import {
    FRAME_HEIGHT_CEILING_PX,
    IN_FLIGHT_ACTION_CAPACITY,
    SANDBOX_PROTOCOL_VERSION,
    checkHostMessage,
    type FrameMessage,
    type SandboxInitMessage,
} from "../protocol";
import type { SandboxBodyPayload } from "../transform/transform-kind-body";
import { executeKindBody } from "./execute-kind-body";
import { installHostActionDispatcher } from "./host-action-relay";

export interface FrameMountApi {
    (
        container: HTMLElement,
        payload: SandboxBodyPayload,
        options: {
            props?: Record<string, unknown>;
            themeTokens?: Record<string, string>;
            colorScheme?: "light" | "dark";
            onError?: (message: string) => void;
        },
    ): {
        update(props: Record<string, unknown>): void;
        setTheme(
            tokens: Record<string, string>,
            colorScheme?: "light" | "dark",
        ): void;
        unmount(): void;
    };
}

interface RefusalLog {
    count: number;
    last: string | null;
}

const refusals: RefusalLog = { count: 0, last: null };

function refuse(sentence: string): void {
    refusals.count += 1;
    refusals.last = sentence;
    // eslint-disable-next-line no-console
    console.warn(`[kind-sandbox] ${sentence}`);
}

/** Read by the acceptance harness and by the host's own probe. */
export function frameRefusals(): Readonly<RefusalLog> {
    return refusals;
}

/**
 * The origin this document was SERVED from — not the origin it RUNS on. See
 * the origin check below for why the two differ inside the sandbox.
 */
function servedOrigin(): string {
    try {
        return new URL(window.location.href).origin;
    } catch {
        return "";
    }
}

export function installFrameBridge(mount: FrameMountApi): void {
    if (typeof window === "undefined") return;

    const onWindowMessage = (event: MessageEvent): void => {
        // THE FRAME-SIDE ORIGIN CHECK: only the origin this document was
        // SERVED from may hand the frame its port.
        //
        // WHICH ORIGIN, and the correction that belongs here. The frame is
        // sandboxed without `allow-same-origin`, so it RUNS on an opaque
        // origin — but only some of the ways to ask about it say so. Measured
        // inside a real `/kind-sandbox` frame (Chrome 153, 2026-09-12, V-30,
        // and asserted every run by `browser/kind-sandbox.spec.ts`):
        //
        //     self.origin / window.origin   →  "null"      (the opaque one)
        //     location.origin               →  "http://localhost:3000"
        //     new URL(location.href).origin →  "http://localhost:3000"
        //
        // An earlier version of this comment said `location.origin` is the
        // string "null" here and that comparing against it "refuses the real
        // host every single time". That is NOT what Chrome does, and no such
        // bug existed — the false sentence is corrected rather than repeated
        // (S6). `Location.origin` follows the document URL; it is
        // `Window.origin` that serializes an opaque origin to "null".
        //
        // The code still parses `location.href`, deliberately: it is the one
        // spelling that is correct in every engine, including any that follows
        // the spec's latitude and reports an opaque `location.origin`. Same
        // answer, no reliance on which of the two an engine picked.
        if (event.origin !== servedOrigin()) {
            refuse(
                `Ignored a message from "${event.origin}". This frame only accepts its host page at ${servedOrigin()}.`,
            );
            return;
        }
        const data = event.data as { type?: unknown } | null;
        if (!data || (data as { type?: unknown }).type !== "matrx:sandbox:init") {
            refuse(
                `Ignored a window message of type "${String(
                    data && (data as { type?: unknown }).type,
                )}" — the frame only adopts its host through an init message.`,
            );
            return;
        }
        const port = event.ports[0];
        if (!port) {
            refuse(
                "Ignored an init message that carried no channel — the frame cannot answer without one.",
            );
            return;
        }
        window.removeEventListener("message", onWindowMessage);
        startInstance(data as unknown as SandboxInitMessage, port, mount);
    };

    window.addEventListener("message", onWindowMessage);
}

function startInstance(
    init: SandboxInitMessage,
    port: MessagePort,
    mount: FrameMountApi,
): void {
    const instanceId = String(init.instanceId ?? "");
    const send = (message: FrameMessage): void => {
        try {
            port.postMessage(message);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(
                "[kind-sandbox] could not reach the host page:",
                err instanceof Error ? err.message : err,
            );
        }
    };

    if (init.protocolVersion !== SANDBOX_PROTOCOL_VERSION) {
        send({
            type: "matrx:sandbox:error",
            instanceId,
            message: `The Shape sandbox in this page speaks protocol ${String(
                init.protocolVersion,
            )} but the loaded runtime speaks ${SANDBOX_PROTOCOL_VERSION}. Reload the page to pick up the current sandbox runtime.`,
        });
        return;
    }

    const container = document.getElementById("root");
    if (!container) {
        send({
            type: "matrx:sandbox:error",
            instanceId,
            message:
                "The sandbox document has no mount point, so the component could not be rendered.",
        });
        return;
    }

    // ── what the frame's CSP refused, said out loud (S5) ─────────────────
    //
    // The frame's `img-src` is `data: blob:` plus the platform image door
    // (chair ruling 2), so an organization component that renders a REMOTE
    // image gets a broken-image box and nothing else: the browser refuses the
    // request, the component does not know, the reader sees a gap, and the
    // author is never told. That is a silent failure in the exact place the
    // sandbox was supposed to make failures loud.
    //
    // The frame cannot report a CSP violation the usual way — `report-uri`
    // and the Reporting API are network calls and `connect-src` is `'none'` —
    // but it does get the DOM event. Relaying it as a normal sandbox error
    // puts it where every other component failure already goes: the host's
    // `captureError` and `content_ir.kind_component_incident`, the queue the
    // component-authoring agent reads.
    //
    // Deduped per (directive, blocked URL): one broken image in a list of
    // thirty must not file thirty incidents.
    const reportedViolations = new Set<string>();
    document.addEventListener("securitypolicyviolation", (event) => {
        const violation = event as SecurityPolicyViolationEvent;
        const blocked = String(violation.blockedURI ?? "");
        const directive = String(violation.effectiveDirective ?? violation.violatedDirective ?? "");
        const key = `${directive}|${blocked}`;
        if (reportedViolations.has(key)) return;
        reportedViolations.add(key);
        const what =
            directive.startsWith("img")
                ? `This component tried to load an image from ${blocked || "another site"}. Components stored in the database may only show images the platform itself serves, so nothing was displayed. Put the image through the platform's image door, or store it with the Shape.`
                : `This component tried to reach ${blocked || "another site"} (${directive || "a blocked resource"}), which components stored in the database may not do. Nothing was loaded.`;
        send({
            type: "matrx:sandbox:error",
            instanceId,
            message: what,
            errorType: "blocked_resource",
        });
    });

    // ── the action bridge (§1.7) ──────────────────────────────────────────
    const pending = new Map<
        string,
        (result: { ok: boolean; value?: unknown; error?: string }) => void
    >();
    let callSeq = 0;

    const callHost = (
        key: string,
        input: unknown,
    ): Promise<{ ok: boolean; value?: unknown; error?: string }> => {
        if (pending.size >= IN_FLIGHT_ACTION_CAPACITY) {
            const sentence = `Refused the action "${key}": ${IN_FLIGHT_ACTION_CAPACITY} actions from this component are already waiting on the page. Nothing was sent.`;
            refuse(sentence);
            return Promise.resolve({ ok: false, error: sentence });
        }
        callSeq += 1;
        const callId = `${instanceId}:${callSeq}`;
        return new Promise((resolve) => {
            pending.set(callId, resolve);
            send({
                type: "matrx:sandbox:action",
                instanceId,
                callId,
                key,
                input,
            });
        });
    };

    // Chair ruling 7: the copy bar's two host-only items use THIS pipe.
    installHostActionDispatcher(callHost);

    /**
     * The prop the component actually receives. It returns the SAME envelope
     * the in-page `useKindActionRunner` returns — `{ ok:true, result }` or
     * `{ ok:false, error }` — so a body behaves identically in the frame and
     * in the page, and never throws.
     */
    const runAction = async (
        key: string,
        input: unknown,
    ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
        const answer = await callHost(key, input);
        return answer.ok
            ? { ok: true, result: answer.value }
            : {
                  ok: false,
                  error:
                      answer.error ??
                      `The action "${key}" did not run, and the page gave no reason.`,
              };
    };

    const onResolve = (value: unknown): void => {
        send({ type: "matrx:sandbox:resolve", instanceId, value });
    };

    const reportError = (message: string): void => {
        send({ type: "matrx:sandbox:error", instanceId, message });
    };

    // ── props_transform (§1.2: 162 live rows, some carry one) ─────────────
    // It is organization-authored code, so it runs HERE, never in the page.
    // `executeKindBody` returns whatever the body evaluates to; for a
    // transform that is a plain value → value function.
    let transform: ((value: unknown) => unknown) | null = null;
    if (init.propsTransform) {
        const built = executeKindBody(init.propsTransform as SandboxBodyPayload);
        if (typeof built.Component === "function") {
            transform = built.Component as unknown as (v: unknown) => unknown;
        } else {
            send({
                type: "matrx:sandbox:error",
                instanceId,
                errorType: "transform_error",
                message: `The value transform on this component did not compile, so the component is showing the untransformed value: ${
                    built.error ?? "no function was produced"
                }`,
            });
        }
    }

    /** Loud, never fatal — exactly the page's rule for a throwing transform. */
    const transformed = (props: Record<string, unknown>): Record<string, unknown> => {
        if (!transform) return props;
        try {
            return { ...props, data: transform(props.data) };
        } catch (err) {
            send({
                type: "matrx:sandbox:error",
                instanceId,
                errorType: "transform_error",
                message: `The value transform on this component threw, so it is showing the untransformed value: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            });
            return props;
        }
    };

    const withHostProps = (
        props: Record<string, unknown>,
    ): Record<string, unknown> => ({
        ...transformed(props),
        runAction,
        onResolve,
    });

    const handle = mount(container, init.body as SandboxBodyPayload, {
        props: withHostProps(init.props ?? {}),
        themeTokens: init.themeTokens,
        colorScheme: init.colorScheme,
        onError: reportError,
    });

    // ── sizing (§1.8, S3) ─────────────────────────────────────────────────
    //
    // The frame measures itself and the host gives the iframe exactly that
    // many pixels, so NOTHING scrolls inside the frame — the host page owns
    // scroll, and a component in a chat thread reads as one continuous page.
    //
    // The measurement is not simply the root's box, because an overlay
    // (tooltip, select popover) is portalled to `document.body` as a SIBLING
    // of the root and is usually absolutely positioned: it contributes nothing
    // to the root's height, and a frame sized to the root alone would clip it
    // to nothing. Overlays are frame-local by ruling 4 — clipped honestly by
    // the frame's own box — but "honestly" means the frame first grows to hold
    // what it can.
    let lastHeight = -1;
    let lastContentHeight = -1;
    let scheduled = false;

    const measure = (): number => {
        let bottom = container.getBoundingClientRect().bottom;
        for (const node of Array.from(document.body.children)) {
            if (node === container) continue;
            if (!(node instanceof HTMLElement)) continue;
            const rect = node.getBoundingClientRect();
            if (rect.height <= 0 && rect.width <= 0) continue;
            if (rect.bottom > bottom) bottom = rect.bottom;
        }
        // `bottom` is viewport-relative and the frame never scrolls, so it is
        // the content height.
        //
        // 🚨 IT MUST NOT FALL BACK TO `documentElement.scrollHeight`, which is
        // never smaller than the frame's own viewport — i.e. never smaller
        // than the height the HOST just gave the iframe. Measured that way a
        // short component reports the host's height back and the frame can
        // never shrink, and any body that stretches to full height feeds the
        // host a bigger number every round: observed 2026-09-12 in headless
        // Chrome, one live body walked 320 → 1238 → 4000 → capped at 16103 px
        // with no content change at all.
        return Math.ceil(bottom);
    };

    const reportSize = (): void => {
        // A DEGENERATE LAYOUT IS NOT A HEIGHT. Mid-relayout the frame can be
        // measured at zero width, where every line of text wraps to one word
        // and the content reads as many times taller than it is — observed
        // once in headless Chrome on 2026-09-12, a 1,238 px body reporting
        // 16,103 px for a single frame before settling back. Reporting that
        // would flash the host's "Show all" control on a component that fits.
        if (document.documentElement.clientWidth <= 0) return;
        const contentHeight = measure();
        if (contentHeight <= 0) return;
        const height = Math.min(contentHeight, FRAME_HEIGHT_CEILING_PX);
        if (height === lastHeight && contentHeight === lastContentHeight) return;
        lastHeight = height;
        lastContentHeight = contentHeight;
        send({
            type: "matrx:sandbox:size",
            instanceId,
            height,
            contentHeight,
            capped: contentHeight > FRAME_HEIGHT_CEILING_PX,
        });
    };

    /**
     * One report per animation frame. A streaming chat block re-renders many
     * times a second and an unthrottled ResizeObserver would post a message
     * per layout — the host would then resize the iframe mid-layout, which
     * resizes the frame, which reports again. Coalescing to the frame boundary
     * is what §1.8 asks for and what stops that loop.
     */
    const scheduleSize = (): void => {
        if (scheduled) return;
        scheduled = true;
        const run = () => {
            scheduled = false;
            reportSize();
        };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
        else setTimeout(run, 16);
    };

    const observer =
        typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(() => scheduleSize());
    observer?.observe(container);
    // Overlays are portalled to `body`, so watch for their arrival too —
    // otherwise a tooltip opens into a frame that never grew for it.
    const bodyObserver =
        typeof MutationObserver === "undefined"
            ? null
            : new MutationObserver(() => scheduleSize());
    bodyObserver?.observe(document.body, { childList: true, subtree: true });
    reportSize();

    port.onmessage = (event: MessageEvent) => {
        const checked = checkHostMessage(event.data, instanceId);
        if (!checked.ok) {
            refuse(checked.refusal);
            return;
        }
        const message = checked.message;
        switch (message.type) {
            case "matrx:sandbox:props":
                handle.update(withHostProps(message.props ?? {}));
                scheduleSize();
                break;
            case "matrx:sandbox:theme":
                handle.setTheme(message.themeTokens ?? {}, message.colorScheme);
                // A theme change can change type metrics and therefore height.
                scheduleSize();
                break;
            case "matrx:sandbox:action-result": {
                const resolver = pending.get(message.callId);
                if (!resolver) {
                    refuse(
                        `Dropped a result for call "${message.callId}" — that call was already answered, or was never made from this component.`,
                    );
                    return;
                }
                pending.delete(message.callId);
                resolver({
                    ok: message.ok,
                    value: message.value,
                    error: message.error,
                });
                break;
            }
            case "matrx:sandbox:dispose":
                observer?.disconnect();
                bodyObserver?.disconnect();
                port.onmessage = null;
                handle.unmount();
                break;
            case "matrx:sandbox:init":
                refuse(
                    "Dropped a second init message — this frame already hosts a component.",
                );
                break;
        }
    };
    port.start?.();

    send({
        type: "matrx:sandbox:ready",
        instanceId,
        runtimeVersion: SANDBOX_PROTOCOL_VERSION,
    });
}
