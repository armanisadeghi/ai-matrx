/**
 * protocol — THE message contract between the host page and the kind sandbox
 * frame (DD-123 §1.6). One module, imported by BOTH sides, so the two halves
 * cannot drift: the host (`react/db-component/KindSandboxFrame.tsx`) and the
 * frame runtime (`runtime/frame-bridge.ts`) validate against these same
 * constants.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HOW THE TWO DOCUMENTS ACTUALLY TALK, and why it is not what §1.6 sketched.
 *
 * §1.6 describes the frame answering on `parent.postMessage`. It cannot, and
 * it should not:
 *
 *  - The frame bundle is audited at build time (`build-kind-sandbox.ts`) and
 *    FAILS if `window.parent`, `window.top` or `parent.postMessage` appears in
 *    the served bytes. That audit is the strongest single guarantee the frame
 *    has — the frame holds no reference to another document at all.
 *  - A sandboxed frame with no `allow-same-origin` has an OPAQUE origin, so
 *    `event.origin` on the parent side is the string `"null"` for this frame
 *    and for every other opaque frame on the page. Origin is simply not an
 *    identity here.
 *
 * So the handshake is a **transferred MessagePort**, which is strictly
 * stronger than an origin check:
 *
 *   1. The host creates a `MessageChannel` and, on the iframe's `load`, posts
 *      `matrx:sandbox:init` to `frame.contentWindow` with `port2` transferred.
 *   2. The frame's ONE window listener checks `event.origin === location.origin`
 *      (the frame knows the origin it was served from — this is the frame-side
 *      origin check §1.6 asks for), takes `event.ports[0]`, and REMOVES the
 *      window listener. From that moment the frame has no window-level ear.
 *   3. Every later message, both directions, travels on that port. A port is a
 *      capability: nobody who did not receive it can post on it, so the host
 *      does not need to guess at an origin — the channel itself is the proof
 *      of identity, and the host never registers a `window` message listener
 *      for sandbox traffic at all.
 *
 * Everything else §1.6 specifies is enforced verbatim: the type allowlists,
 * the 64 KB inbound / 256 KB outbound caps, the instance-id match, the
 * one-answer-per-callId rule, and the 16-in-flight ceiling.
 */

/**
 * Bumped with the message contract. The host refuses a mismatched frame.
 *
 * 2 (S3, 2026-09-12): the host sends resolved THEME TOKENS with `init` and
 * with every `theme` message, and `matrx:sandbox:size` carries the frame's
 * true content height and whether the host's cap is holding it back. A frame
 * still speaking 1 cannot be themed, so it is refused with a sentence rather
 * than rendered in the wrong colours.
 */
export const SANDBOX_PROTOCOL_VERSION = 2;

/** Host → frame. */
export const HOST_MESSAGE_TYPES = [
    "matrx:sandbox:init",
    "matrx:sandbox:props",
    "matrx:sandbox:theme",
    "matrx:sandbox:action-result",
    "matrx:sandbox:dispose",
] as const;

/** Frame → host. */
export const FRAME_MESSAGE_TYPES = [
    "matrx:sandbox:ready",
    "matrx:sandbox:size",
    "matrx:sandbox:action",
    "matrx:sandbox:resolve",
    "matrx:sandbox:error",
] as const;

export type HostMessageType = (typeof HOST_MESSAGE_TYPES)[number];
export type FrameMessageType = (typeof FRAME_MESSAGE_TYPES)[number];

/** §1.6: a single inbound message may not exceed 64 KB. */
export const MAX_INBOUND_BYTES = 64 * 1024;
/** §1.6: outbound props may not exceed 256 KB. */
export const MAX_OUTBOUND_PROPS_BYTES = 256 * 1024;
/** §1.6: at most 16 unanswered actions per instance. */
export const MAX_IN_FLIGHT_ACTIONS = 16;

/**
 * THE SIZING CAP (§1.8, S3). The frame measures itself and the host gives the
 * iframe exactly that height — so nothing scrolls inside the frame and the
 * host page owns scroll. A runaway body (an author's infinite list, a layout
 * loop) must not be able to grow the page without bound, so the host holds it
 * at this height and shows the reader an "expand" control naming the real
 * height. Nothing is hidden silently: the affordance says how tall the thing
 * actually is.
 */
export const MAX_FRAME_HEIGHT = 4000;

/** What "expand" grows to. Past this the host says so rather than growing. */
export const EXPANDED_MAX_FRAME_HEIGHT = 20000;

/**
 * Reserved action keys the frame's two host-only copy-bar items relay on
 * (chair ruling 7). They go through the SAME `matrx:sandbox:action` →
 * `runAction` bridge as every other action — there is no second door. If the
 * host has no handler registered for one, `runAction` answers
 * `{ ok:false, error }` and the frame shows that sentence. That is the honest
 * outcome, not a fallback.
 */
export const HOST_RELAY_ACTION_KEYS = {
    groomWithAgent: "agent_copy_groom",
    sendToGoogle: "send_to_google",
} as const;

export interface SandboxInitMessage {
    type: "matrx:sandbox:init";
    protocolVersion: number;
    instanceId: string;
    kind: string;
    /** The already-Babel-transformed body + its binding contract. */
    body: unknown;
    /**
     * The row's `props_transform`, transformed the same way. It is
     * organization-authored code too, so it runs INSIDE the frame — compiling
     * it in the page would leave exactly the hole the frame exists to close.
     * Null when the row has none.
     */
    propsTransform?: unknown;
    props: Record<string, unknown>;
    themeTokens?: Record<string, string>;
    colorScheme?: "light" | "dark";
}

export interface SandboxPropsMessage {
    type: "matrx:sandbox:props";
    instanceId: string;
    props: Record<string, unknown>;
}

export interface SandboxThemeMessage {
    type: "matrx:sandbox:theme";
    instanceId: string;
    themeTokens?: Record<string, string>;
    colorScheme?: "light" | "dark";
}

export interface SandboxActionResultMessage {
    type: "matrx:sandbox:action-result";
    instanceId: string;
    callId: string;
    ok: boolean;
    value?: unknown;
    error?: string;
}

export interface SandboxDisposeMessage {
    type: "matrx:sandbox:dispose";
    instanceId: string;
}

export type HostMessage =
    | SandboxInitMessage
    | SandboxPropsMessage
    | SandboxThemeMessage
    | SandboxActionResultMessage
    | SandboxDisposeMessage;

export interface SandboxReadyMessage {
    type: "matrx:sandbox:ready";
    instanceId: string;
    runtimeVersion: number;
}

export interface SandboxSizeMessage {
    type: "matrx:sandbox:size";
    instanceId: string;
    /** What the host should give the iframe — never above {@link MAX_FRAME_HEIGHT}. */
    height: number;
    /**
     * What the component ACTUALLY occupies, overlays included. Equal to
     * `height` in the normal case; larger when the cap is holding the frame
     * back, which is how the host knows to offer the expand control and what
     * number to put in it (S3).
     */
    contentHeight?: number;
    /** True when `contentHeight > MAX_FRAME_HEIGHT` — the reader is seeing part. */
    capped?: boolean;
}

export interface SandboxActionMessage {
    type: "matrx:sandbox:action";
    instanceId: string;
    callId: string;
    key: string;
    input: unknown;
}

export interface SandboxResolveMessage {
    type: "matrx:sandbox:resolve";
    instanceId: string;
    value: unknown;
}

/** The incident types the frame can distinguish. The host maps them onto the
 *  EXISTING `kind_component_incident` vocabulary — it invents nothing. */
export const SANDBOX_ERROR_TYPES = [
    "render_throw",
    "compile_error",
    "transform_error",
] as const;
export type SandboxErrorType = (typeof SANDBOX_ERROR_TYPES)[number];

export interface SandboxErrorMessage {
    type: "matrx:sandbox:error";
    instanceId: string;
    message: string;
    /** Absent reads as `render_throw`, which is what a frame failure is. */
    errorType?: SandboxErrorType;
}

export type FrameMessage =
    | SandboxReadyMessage
    | SandboxSizeMessage
    | SandboxActionMessage
    | SandboxResolveMessage
    | SandboxErrorMessage;

/** The result of checking one inbound message. Never a boolean — a refusal
 *  always carries the sentence that gets logged and counted. */
export type MessageCheck<T> =
    | { ok: true; message: T }
    | { ok: false; refusal: string };

function byteLength(value: unknown): number {
    try {
        const json = JSON.stringify(value);
        if (typeof json !== "string") return Number.POSITIVE_INFINITY;
        // The frame and the host are both browsers; TextEncoder is universal.
        return typeof TextEncoder === "undefined"
            ? json.length
            : new TextEncoder().encode(json).length;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}

/** Exported so the host's props cap and this share one measurement. */
export const measureBytes = byteLength;

function checkEnvelope(
    raw: unknown,
    allowed: readonly string[],
    instanceId: string,
    direction: "frame" | "host",
    cap: number,
): MessageCheck<{ type: string; instanceId: string }> {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {
            ok: false,
            refusal: `Dropped a ${direction} message that is not an object.`,
        };
    }
    const msg = raw as Record<string, unknown>;
    const type = msg.type;
    if (typeof type !== "string" || !allowed.includes(type)) {
        return {
            ok: false,
            refusal: `Dropped a ${direction} message with an unknown type "${String(
                type,
            )}". Only these are accepted: ${allowed.join(", ")}.`,
        };
    }
    const size = byteLength(raw);
    if (size > cap) {
        return {
            ok: false,
            refusal: `Dropped a "${type}" message of ${size} bytes — the cap is ${cap} bytes. Nothing was rendered from it.`,
        };
    }
    if (msg.instanceId !== instanceId) {
        return {
            ok: false,
            refusal: `Dropped a "${type}" message addressed to instance "${String(
                msg.instanceId,
            )}" — this channel belongs to "${instanceId}".`,
        };
    }
    return { ok: true, message: { type, instanceId } };
}

/** Host side: validate one message that arrived from the frame. */
export function checkFrameMessage(
    raw: unknown,
    instanceId: string,
): MessageCheck<FrameMessage> {
    const envelope = checkEnvelope(
        raw,
        FRAME_MESSAGE_TYPES,
        instanceId,
        "frame",
        MAX_INBOUND_BYTES,
    );
    if (!envelope.ok) return envelope;
    const msg = raw as Record<string, unknown>;

    if (msg.type === "matrx:sandbox:action") {
        if (typeof msg.callId !== "string" || !msg.callId) {
            return {
                ok: false,
                refusal: `Dropped an action from the sandbox with no call id.`,
            };
        }
        if (typeof msg.key !== "string" || !msg.key) {
            return {
                ok: false,
                refusal: `Dropped an action from the sandbox with no action key.`,
            };
        }
    }
    if (msg.type === "matrx:sandbox:size") {
        if (typeof msg.height !== "number" || !Number.isFinite(msg.height)) {
            return {
                ok: false,
                refusal: `Dropped a size message whose height is not a number.`,
            };
        }
        if (
            msg.contentHeight !== undefined &&
            (typeof msg.contentHeight !== "number" ||
                !Number.isFinite(msg.contentHeight))
        ) {
            return {
                ok: false,
                refusal: `Dropped a size message whose content height is not a number — the frame stays at the height it already had.`,
            };
        }
    }
    if (msg.type === "matrx:sandbox:error" && typeof msg.message !== "string") {
        return {
            ok: false,
            refusal: `Dropped an error message from the sandbox with no sentence in it.`,
        };
    }
    return { ok: true, message: raw as FrameMessage };
}

/** Frame side: validate one message that arrived from the host. */
export function checkHostMessage(
    raw: unknown,
    instanceId: string,
): MessageCheck<HostMessage> {
    // Host → frame carries the component body and the instance value, so the
    // ceiling here is the 256 KB outbound cap, not the 64 KB inbound one. The
    // host measures before it sends and renders a named error rather than
    // truncating (§1.6).
    const envelope = checkEnvelope(
        raw,
        HOST_MESSAGE_TYPES,
        instanceId,
        "host",
        MAX_OUTBOUND_PROPS_BYTES,
    );
    if (!envelope.ok) return envelope;
    return { ok: true, message: raw as HostMessage };
}
