"use client";

/**
 * KindSandboxFrame — the HOST half of the Shape sandbox (DD-123 §1.3, §1.6,
 * §1.7). One iframe per component instance, pointed at the same-origin
 * `/kind-sandbox` route, `sandbox="allow-scripts"` and NEVER
 * `allow-same-origin` — so the frame's origin is opaque, it cannot read a
 * cookie, script this page, or reach the network (`connect-src 'none'` in the
 * route's CSP header).
 *
 * HOW IT TALKS TO THE FRAME. On the iframe's `load` this posts ONE message —
 * `matrx:sandbox:init` — carrying a transferred `MessagePort`. Everything
 * after that travels on the port, in both directions, and this component never
 * registers a `window` message listener at all. The reasoning (an opaque
 * origin is not an identity; the frame bundle is audited to contain no
 * reference to another document) is written once, in `sandbox/protocol.ts`.
 *
 * WHAT CROSSES, AND WHAT CANNOT. `data`, `kind`, `config` and `uiOptions` are
 * plain JSON and cross as a structured clone. `runAction` and `onResolve` are
 * functions and cannot: the frame gets stand-ins that post
 * `matrx:sandbox:action` / `matrx:sandbox:resolve`, and THIS component calls
 * the very same `runAction` the in-page component would have been handed
 * (§1.7). No new capability, no second door — including the copy bar's two
 * host-only items (chair ruling 7), which relay on the same pipe.
 *
 * EVERY REFUSAL IS NAMED (Law 4). An unknown message type, a message for
 * another instance, one over the 64 KB cap, a duplicate answer, or a 17th
 * in-flight action is dropped with a sentence that goes to the console and to
 * the Error Inspector — never dropped quietly, never a truncated render.
 */

import React from "react";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { getDefaultImportsForKindComponents } from "@/features/agent-apps/utils/allowed-imports";
import { transformKindComponentBody } from "@/features/content-ir/sandbox/transform/transform-kind-body";
import {
    IN_FLIGHT_ACTION_CAPACITY,
    MAX_OUTBOUND_PROPS_BYTES,
    SANDBOX_ERROR_TYPES,
    SANDBOX_PROTOCOL_VERSION,
    checkFrameMessage,
    measureBytes,
    type HostMessage,
} from "@/features/content-ir/sandbox/protocol";
import {
    readColorScheme,
    readThemeTokens,
} from "@/features/content-ir/sandbox/theme-tokens";
import type { SandboxBodyPayload } from "@/features/content-ir/sandbox/transform/transform-kind-body";
import { formatText } from "@ai-matrx/kit/text-case";
import type { ComponentResolution } from "@ai-matrx/content-ir-react";
import type { RunKindAction } from "../actions/useKindActionRunner";
import type {
    KindComponentUiOptions,
    ResolveKindValue,
} from "./dbKindComponentCache";
import { reportKindComponentIncident } from "./kindComponentIncident";
import type { KindSandboxCeilings } from "./useKindSandboxKnob";

/** The sandbox document. Same origin; the `sandbox` attribute opaques it. */
export const KIND_SANDBOX_ROUTE = "/kind-sandbox";

/** What an un-measured frame occupies until it reports its own height. */
const INITIAL_HEIGHT = 320;

/**
 * THE FRAME'S ACCESSIBLE NAME (S3). An iframe with no name is announced as
 * "frame" and a reader moving by landmarks has no idea what they have entered.
 * The row's own label is the honest name; failing that the kind key, spelled
 * the way the rest of the product spells a key (`@ai-matrx/kit/text-case`).
 */
export function sandboxFrameTitle(
    kind: string,
    config: Record<string, unknown> | null | undefined,
): string {
    const declared = config?.label ?? config?.title ?? config?.display_name;
    const label =
        typeof declared === "string" && declared.trim()
            ? declared.trim()
            : formatText(kind);
    return `${label} — component`;
}

/**
 * Transform once per (kind, row version) — the same staleness key the in-page
 * compile cache uses. Babel stays in the page (§1.4); the frame only ever
 * receives plain JSON.
 */
interface TransformEntry {
    payload: SandboxBodyPayload | null;
    error: string | null;
    propsTransform: SandboxBodyPayload | null;
    propsTransformError: string | null;
}

const transformCache = new Map<string, TransformEntry>();

function transformFor(
    kind: string,
    resolution: ComponentResolution,
): TransformEntry {
    const key = `${kind}::${resolution.updatedAt ?? "unversioned"}`;
    const hit = transformCache.get(key);
    if (hit) return hit;
    const declared = (resolution.config as Record<string, unknown> | null)
        ?.allowed_imports;
    const allowedImports =
        Array.isArray(declared) && declared.every((e) => typeof e === "string")
            ? (declared as string[])
            : getDefaultImportsForKindComponents();
    const result = transformKindComponentBody(
        resolution.componentSource ?? "",
        allowedImports,
    );
    // The row's props_transform gets the same treatment and an EMPTY
    // allowlist, exactly as the in-page cache compiles it — it is a value →
    // value function, not a component, and it runs inside the frame.
    const transform = resolution.propsTransform?.trim()
        ? transformKindComponentBody(resolution.propsTransform, [])
        : { payload: null, error: null };
    if (transform.error) {
        // Once per row version: the transform did not even compile, so the
        // frame will render the untransformed value. Loud, never fatal.
        const message = `[kind-sandbox] props_transform for kind "${kind}" failed to compile — the sandbox will render the untransformed value: ${transform.error}`;
        console.error(message);
        captureError({ source: "content-ir", message, raw: { kind } });
    }
    const entry = {
        payload: result.payload,
        error: result.error,
        propsTransform: transform.payload,
        propsTransformError: transform.error,
    };
    transformCache.set(key, entry);
    return entry;
}

/** Test seam + the authoring surfaces' invalidation hook. */
export function invalidateKindSandboxTransforms(): void {
    transformCache.clear();
}


/**
 * WHAT THE READER GETS WHEN A COMPONENT IS TALLER THAN THE CEILING (S3).
 *
 * Pure on purpose: the decision — how tall the iframe is, whether a control is
 * offered, and the exact sentence beside it — is the part that must never go
 * quiet, so it is testable without a browser. A component the ceiling is
 * holding back NEVER just ends: the sentence says how tall it really is.
 */
export interface FrameHeightDecision {
    height: number;
    capped: boolean;
    control: "none" | "show-all" | "show-less";
    sentence: string | null;
}

export function frameHeightDecision(
    measuredHeight: number,
    contentHeight: number,
    expanded: boolean,
    /**
     * The RESOLVED ceilings (S7) — `custom.sandbox_frame_height_px` and
     * `custom.sandbox_expanded_frame_height_px` from the settings register.
     * Required: this function holds no default, because a host-side default is
     * exactly the frozen number the knob system exists to end.
     */
    ceilings: Pick<KindSandboxCeilings, "frameHeightPx" | "expandedFrameHeightPx">,
): FrameHeightDecision {
    const ceiling = ceilings.frameHeightPx;
    const expandedCeiling = ceilings.expandedFrameHeightPx;
    if (contentHeight <= ceiling) {
        return { height: measuredHeight, capped: false, control: "none", sentence: null };
    }
    if (!expanded) {
        return {
            height: Math.min(measuredHeight, ceiling),
            capped: true,
            control: "show-all",
            sentence: `This component is ${contentHeight} pixels tall; ${ceiling} are shown.`,
        };
    }
    if (contentHeight > expandedCeiling) {
        return {
            height: expandedCeiling,
            capped: true,
            control: "show-less",
            sentence: `This component is ${contentHeight} pixels tall — more than one screen can usefully hold, so it is shown at ${expandedCeiling} pixels and the rest is cut off.`,
        };
    }
    return {
        height: contentHeight,
        capped: true,
        control: "show-less",
        sentence: `Showing all ${contentHeight} pixels of this component.`,
    };
}

/** Counted, so a refusal is a fact a test can read — not only a log line. */
const refusalCounts = new Map<string, number>();

export function kindSandboxRefusals(): ReadonlyMap<string, number> {
    return refusalCounts;
}

export function resetKindSandboxRefusals(): void {
    refusalCounts.clear();
}

export interface KindSandboxFrameProps {
    kind: string;
    resolution: ComponentResolution;
    /**
     * The RAW instance value (post-field-security). The row's
     * `props_transform` is organization-authored code, so the FRAME applies
     * it — running it here would leave the hole the frame exists to close.
     */
    data: unknown;
    config: Record<string, unknown>;
    runAction: RunKindAction;
    onResolve?: ResolveKindValue;
    uiOptions?: KindComponentUiOptions;
    className?: string;
    /**
     * The ceilings this host enforces, resolved from the settings register by
     * `useKindSandboxSettings()`. The gate and the ceilings come from the SAME
     * read, so a frame can never mount without them.
     */
    ceilings: KindSandboxCeilings;
}

export const KindSandboxFrame: React.FC<KindSandboxFrameProps> = ({
    kind,
    resolution,
    data,
    config,
    runAction,
    onResolve,
    uiOptions,
    className,
    ceilings,
}) => {
    const frameRef = React.useRef<HTMLIFrameElement | null>(null);
    const portRef = React.useRef<MessagePort | null>(null);
    const answered = React.useRef<Set<string>>(new Set());
    const inFlight = React.useRef<Set<string>>(new Set());
    const [height, setHeight] = React.useState(INITIAL_HEIGHT);
    const [contentHeight, setContentHeight] = React.useState(INITIAL_HEIGHT);
    const [expanded, setExpanded] = React.useState(false);
    const [oversize, setOversize] = React.useState<string | null>(null);

    const instanceId = React.useId();
    const { payload, error: transformError, propsTransform } = transformFor(
        kind,
        resolution,
    );

    const props: Record<string, unknown> = {
        data,
        kind,
        config,
        uiOptions: uiOptions ?? null,
    };

    // The port handler outlives any one render, so it reads the CURRENT props
    // and callbacks through this ref instead of re-subscribing.
    const latest = React.useRef({ runAction, onResolve, kind, data, resolution });
    latest.current = { runAction, onResolve, kind, data, resolution };

    // The port handler outlives a settings change too: an admin lowering
    // `custom.sandbox_message_bytes` tightens live frames within the resolver's
    // TTL, without a remount.
    const latestCeilings = React.useRef(ceilings);
    latestCeilings.current = ceilings;

    function refuse(sentence: string): void {
        refusalCounts.set(sentence, (refusalCounts.get(sentence) ?? 0) + 1);
        const message = `[kind-sandbox] ${latest.current.kind}: ${sentence}`;
        console.warn(message);
        captureError({
            source: "content-ir",
            message,
            raw: { kind: latest.current.kind, instanceId },
        });
    }

    /**
     * Send on the port. Before the frame has loaded there is no port yet and
     * nothing is lost — `init` carries the current props. Over the cap, the
     * message is refused with a visible sentence rather than truncated.
     */
    function post(message: HostMessage): boolean {
        const port = portRef.current;
        if (!port) return false;
        const size = measureBytes(message);
        if (size > MAX_OUTBOUND_PROPS_BYTES) {
            const sentence = `Refused to send a "${message.type}" of ${size} bytes to the sandbox — the cap is ${MAX_OUTBOUND_PROPS_BYTES} bytes. The component is showing the last value it received.`;
            refuse(sentence);
            setOversize(sentence);
            return false;
        }
        port.postMessage(message);
        return true;
    }

    function onPortMessage(event: MessageEvent): void {
        const checked = checkFrameMessage(
            event.data,
            instanceId,
            latestCeilings.current.messageBytes,
        );
        if (!checked.ok) {
            refuse(checked.refusal);
            return;
        }
        const message = checked.message;
        switch (message.type) {
            case "matrx:sandbox:ready":
                break;
            case "matrx:sandbox:size": {
                // The frame reports what it OCCUPIES; the host decides what to
                // give it. Nothing scrolls inside the frame, so the iframe is
                // exactly as tall as its content — up to the cap, past which
                // the reader gets a control that names the real height (S3).
                const measured = Math.max(
                    1,
                    Math.ceil(message.contentHeight ?? message.height),
                );
                setContentHeight(measured);
                setHeight(Math.max(1, Math.ceil(message.height)));
                break;
            }
            case "matrx:sandbox:resolve":
                latest.current.onResolve?.(message.value);
                break;
            case "matrx:sandbox:error":
                captureError({
                    source: "content-ir",
                    message: `[kind-sandbox] ${latest.current.kind}: ${message.message}`,
                    raw: { kind: latest.current.kind },
                });
                // The author's own queue, through the EXISTING producer.
                reportKindComponentIncident({
                    kind: latest.current.kind,
                    errorType:
                        message.errorType &&
                        (SANDBOX_ERROR_TYPES as readonly string[]).includes(
                            message.errorType,
                        )
                            ? message.errorType
                            : "render_throw",
                    message: `Rendered in the Shape sandbox: ${message.message}`,
                    componentKey: latest.current.resolution.componentKey,
                    componentUpdatedAt: latest.current.resolution.updatedAt,
                    data: latest.current.data,
                });
                break;
            case "matrx:sandbox:action": {
                if (answered.current.has(message.callId)) {
                    refuse(
                        `Dropped a repeat of call "${message.callId}" — it was already answered.`,
                    );
                    return;
                }
                if (inFlight.current.size >= IN_FLIGHT_ACTION_CAPACITY) {
                    const sentence = `Refused the action "${message.key}": ${IN_FLIGHT_ACTION_CAPACITY} actions from this component are already running.`;
                    refuse(sentence);
                    answered.current.add(message.callId);
                    post({
                        type: "matrx:sandbox:action-result",
                        instanceId,
                        callId: message.callId,
                        ok: false,
                        error: sentence,
                    });
                    return;
                }
                inFlight.current.add(message.callId);
                // THE ONE BRIDGE (§1.7): the host's own runAction, nothing
                // else. It never throws and answers an unknown key honestly.
                void latest.current
                    .runAction(message.key, message.input)
                    .then((result) => {
                        inFlight.current.delete(message.callId);
                        answered.current.add(message.callId);
                        post({
                            type: "matrx:sandbox:action-result",
                            instanceId,
                            callId: message.callId,
                            ok: result.ok,
                            value: result.ok ? result.result : undefined,
                            error: result.ok ? undefined : result.error,
                        });
                    });
                break;
            }
        }
    }

    /** Open the channel once the frame document has run its bundle. */
    function handleLoad(): void {
        const frame = frameRef.current;
        if (!frame?.contentWindow || !payload) return;

        portRef.current?.close();
        answered.current.clear();
        inFlight.current.clear();

        const channel = new MessageChannel();
        portRef.current = channel.port1;
        channel.port1.onmessage = onPortMessage;
        channel.port1.start();

        frame.contentWindow.postMessage(
            {
                type: "matrx:sandbox:init",
                protocolVersion: SANDBOX_PROTOCOL_VERSION,
                instanceId,
                kind,
                body: payload,
                propsTransform,
                props,
                // The frame links the same compiled stylesheet, but it cannot
                // see which of light/dark the reader is in, nor any token the
                // host RESOLVED at runtime (an organization theme, a user
                // accent). Both cross here, at mount, before first paint.
                themeTokens: readThemeTokens(document),
                colorScheme: readColorScheme(document),
            },
            // The frame's origin is OPAQUE (no allow-same-origin), so "*" is
            // the only targetOrigin that can reach it. The frame checks the
            // origin on its side, which is the half that can.
            "*",
            [channel.port2],
        );
    }

    /** Props changes after init. */
    React.useEffect(() => {
        post({ type: "matrx:sandbox:props", instanceId, props });
        // The port handler reads nothing from this closure; the VALUES are the
        // dependency, which is why the functions are not listed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId, data, kind, config, uiOptions]);

    /**
     * Theme changes: the host owns light/dark and the organization theme, the
     * frame owns its own `:root`. Every way the app can change how it looks
     * lands on the root element — the `dark` class, an inline custom property
     * written by a theme applier, a `data-theme` attribute — so all three are
     * watched and the resolved tokens are re-read and re-sent. A theme flip the
     * frame did not hear about is a visibly wrong component, which is exactly
     * the parity S3 exists to hold.
     */
    React.useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => {
            post({
                type: "matrx:sandbox:theme",
                instanceId,
                themeTokens: readThemeTokens(document),
                colorScheme: readColorScheme(document),
            });
        });
        observer.observe(root, {
            attributes: true,
            attributeFilter: ["class", "style", "data-theme"],
        });
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instanceId]);

    /** Tell the frame to tear its React root down, then close the channel. */
    React.useEffect(() => {
        return () => {
            const port = portRef.current;
            if (!port) return;
            try {
                port.postMessage({ type: "matrx:sandbox:dispose", instanceId });
            } catch {
                // The frame is already gone; there is nobody to tell.
            }
            port.close();
            portRef.current = null;
        };
    }, [instanceId]);

    if (transformError || !payload) {
        const sentence =
            transformError ??
            "This component has no body to render, so the sandbox has nothing to show.";
        return (
            <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground"
            >
                <strong className="block">
                    This component could not be prepared.
                </strong>
                <span className="text-muted-foreground">{sentence}</span>
            </div>
        );
    }

    // THE HEIGHT THE IFRAME GETS. Normally the content's own height, so the
    // frame never scrolls and the host page owns scroll. Past the ceiling the
    // reader is told, in a control, how tall the thing really is (S3).
    const decision = frameHeightDecision(height, contentHeight, expanded, ceilings);
    const title = sandboxFrameTitle(kind, resolution.config as Record<string, unknown>);

    return (
        <>
            <iframe
                ref={frameRef}
                src={KIND_SANDBOX_ROUTE}
                // NEVER allow-same-origin: with it the frame could script this
                // page and read the signed-in session.
                sandbox="allow-scripts"
                onLoad={handleLoad}
                // THE ACCESSIBLE NAME. An unnamed iframe is announced as
                // "frame"; with this a screen-reader user knows what they have
                // tabbed into, and the frame stays in the page's tab order
                // exactly where it sits (an iframe is focusable by default —
                // nothing here removes it from the sequence).
                title={title}
                data-matrx-kind-sandbox={kind}
                className={className ?? "w-full border-0"}
                style={{ height: decision.height, display: "block" }}
            />
            {decision.capped ? (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => setExpanded((value) => !value)}
                        className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-accent"
                    >
                        {decision.control === "show-less" ? "Show less" : "Show all"}
                    </button>
                    <span>{decision.sentence}</span>
                </div>
            ) : null}
            {oversize ? (
                <div
                    role="alert"
                    className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-muted-foreground"
                >
                    {oversize}
                </div>
            ) : null}
        </>
    );
};
