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
 *
 * 3 (S5b, 2026-09-12): the host sends THE READER'S VIEWPORT WIDTH and the
 * width the component is actually allotted, with `init` and on every change
 * (`matrx:sandbox:layout`). See THE READER'S VIEWPORT below. A frame still
 * speaking 2 lays every viewport media query out against its own box instead
 * of the reader's screen, which is a visibly different component — so it is
 * refused with a sentence rather than rendered wrong.
 */
export const SANDBOX_PROTOCOL_VERSION = 3;

/**
 * 🚨 THE READER'S VIEWPORT IS NOT THE FRAME'S BOX (S5b, DD-123).
 *
 * An iframe is its own viewport: inside it, `@media (max-width: 768px)`,
 * `100vw` and `100dvh` answer about the IFRAME ELEMENT, not about the screen
 * the reader is looking at. The same component mounted straight into the page
 * answers about the reader's screen. So a component sitting in a 674 px column
 * on a 1400 px desktop renders DESKTOP unframed and MOBILE framed — and the
 * app's own `app/globals.css` carries a large `@media (max-width: 768px)`
 * block (`* { max-width: 100% }`, `word-break: break-word` on p/div/span/li/
 * td/th, `[class*="flex"] > * { min-width: 0 }`, `img,video,iframe { height:
 * auto }`, `table { display: block }`, and the unlayered `main { overflow-x:
 * hidden; max-width: 100vw }` that lands squarely on the frame's own
 * `<main id="root">`). Measured 2026-09-12 over 139 live bodies: this is the
 * single cause of the whole "the framed render is taller" column — 70 of them.
 * Proof: with the host page's own viewport ALSO under 768 px, five bodies
 * across the whole diff range went to ZERO divergences over 580 compared
 * elements and identical heights to two decimals.
 *
 * THE FIX, AND WHY IT IS SHAPED THIS WAY. There is no way to tell a browser
 * "evaluate media queries against some other viewport", so the host makes the
 * frame's viewport BE the reader's: the iframe element is given the reader's
 * viewport width and clipped by a wrapper to the width the component is
 * actually allotted, and the frame lays the component out inside a `#root` of
 * exactly that allotted width. Media queries and viewport units then answer
 * the same question on both sides of the boundary, for every rule in every
 * stylesheet, without rewriting any CSS.
 *
 * Container queries are unaffected and stay the right tool for a component
 * that must respond to ITS OWN width (chair ruling 8): `#root` has the allotted
 * width, so a `@container` on the component root resolves exactly as it does
 * in the page.
 */

/** Host → frame. */
export const HOST_MESSAGE_TYPES = [
    "matrx:sandbox:init",
    "matrx:sandbox:props",
    "matrx:sandbox:theme",
    "matrx:sandbox:layout",
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

/**
 * §1.6: a single inbound message may not exceed 64 KB.
 *
 * THIS IS THE FRAME'S COPY, AND THE REGISTER'S DEFAULT — not a host default.
 * The frame cannot read a setting (`connect-src 'none'`), so its number is
 * compiled in here; the HOST reads `custom.sandbox_message_bytes` through the
 * scoped resolver (S7, `useKindSandboxKnob.ts`) and passes it to
 * {@link checkFrameMessage} on every message. Lowering the row tightens the
 * host at once; raising it above this constant does nothing until a new bundle
 * ships, and the seed migration's `basis` says exactly that.
 */
export const MAX_INBOUND_BYTES = 64 * 1024;
/** §1.6: outbound props may not exceed 256 KB. */
export const MAX_OUTBOUND_PROPS_BYTES = 256 * 1024;
/** §1.6: at most 16 unanswered actions per instance. */
export const IN_FLIGHT_ACTION_CAPACITY = 16;

/**
 * THE SIZING CAP (§1.8, S3). The frame measures itself and the host gives the
 * iframe exactly that height — so nothing scrolls inside the frame and the
 * host page owns scroll. A runaway body (an author's infinite list, a layout
 * loop) must not be able to grow the page without bound, so the host holds it
 * at this height and shows the reader an "expand" control naming the real
 * height. Nothing is hidden silently: the affordance says how tall the thing
 * actually is.
 */
export const FRAME_HEIGHT_CEILING_PX = 4000;

/** What "expand" grows to. Past this the host says so rather than growing. */
export const EXPANDED_FRAME_HEIGHT_CEILING_PX = 20000;

/**
 * BOTH HEIGHTS ABOVE ARE THE FRAME'S COPIES AND THE REGISTER'S DEFAULTS (S7).
 * The host resolves `custom.sandbox_frame_height_px` and
 * `custom.sandbox_expanded_frame_height_px` through the scoped resolver and
 * passes them into `frameHeightDecision`; it holds no default of its own —
 * a ceiling that does not resolve turns the sandbox OFF with a sentence rather
 * than quietly reusing a number from this file. The frame caps the `height` it
 * REPORTS at FRAME_HEIGHT_CEILING_PX but always reports the true
 * `contentHeight`, so a host ceiling below 4000 is honoured exactly and one
 * above it needs a new bundle.
 */

/**
 * Reserved action keys the frame's host-only copy-bar item relays on
 * (chair ruling 7). They go through the SAME `matrx:sandbox:action` →
 * `runAction` bridge as every other action — there is no second door. If the
 * host has no handler registered for one, `runAction` answers
 * `{ ok:false, error }` and the frame shows that sentence. That is the honest
 * outcome, not a fallback.
 */
export const HOST_RELAY_ACTION_KEYS = {
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
    /**
     * The READER'S viewport width in CSS pixels — `documentElement.clientWidth`
     * of the host page, the same number the host's own media queries answer
     * against. See THE READER'S VIEWPORT above.
     */
    readerViewportWidth?: number;
    /** The width the component is allotted in the page, in CSS pixels. */
    contentWidth?: number;
}

/**
 * Sent whenever the reader's viewport or the component's allotted width
 * changes — a window resize, an orientation flip, a panel opening beside the
 * component. Same two numbers as `init`, same meaning.
 */
export interface SandboxLayoutMessage {
    type: "matrx:sandbox:layout";
    instanceId: string;
    readerViewportWidth: number;
    contentWidth: number;
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
    | SandboxLayoutMessage
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
    /** What the host should give the iframe — never above {@link FRAME_HEIGHT_CEILING_PX}. */
    height: number;
    /**
     * What the component ACTUALLY occupies, overlays included. Equal to
     * `height` in the normal case; larger when the cap is holding the frame
     * back, which is how the host knows to offer the expand control and what
     * number to put in it (S3).
     */
    contentHeight?: number;
    /** True when `contentHeight > FRAME_HEIGHT_CEILING_PX` — the reader is seeing part. */
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
    /**
     * The frame's own CSP refused a resource the component asked for — a
     * remote image is the live case (chair ruling 2). It has its own type so
     * the incident queue, which keeps ONE open row per
     * (kind, error_type, platform, role), does not fold it into a render
     * throw: "this component cannot show its pictures" and "this component
     * crashed" are different jobs for the author.
     */
    "blocked_resource",
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
    /**
     * The host's resolved `custom.sandbox_message_bytes`. REQUIRED, so a call
     * site that forgot the setting is a type error rather than a silently
     * frozen ceiling. Tests and the frame pass {@link MAX_INBOUND_BYTES}, which
     * is the same number the register was seeded with.
     */
    cap: number,
): MessageCheck<FrameMessage> {
    const envelope = checkEnvelope(
        raw,
        FRAME_MESSAGE_TYPES,
        instanceId,
        "frame",
        cap,
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
    const msg = raw as Record<string, unknown>;
    if (msg.type === "matrx:sandbox:layout") {
        const bad = (["readerViewportWidth", "contentWidth"] as const).find(
            (name) =>
                typeof msg[name] !== "number" ||
                !Number.isFinite(msg[name]) ||
                (msg[name] as number) <= 0,
        );
        if (bad) {
            return {
                ok: false,
                refusal: `Dropped a layout message whose ${bad} is not a positive number — the component stays at the width it already had, which may not be the reader's.`,
            };
        }
    }
    return { ok: true, message: raw as HostMessage };
}
