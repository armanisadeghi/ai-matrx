/**
 * host-action-relay — the ONE way anything inside the frame asks the host to
 * do something.
 *
 * It exists as its own module for two reasons, both structural:
 *
 *  1. **No second door.** Chair ruling 7: the copy bar's Send to Google action
 *     is relayed through the SAME
 *     `matrx:sandbox:action` → `runAction` bridge the components use. They ask
 *     here; `frame-bridge.ts` installs the dispatcher; there is no other path
 *     out of the frame.
 *  2. **No import cycle.** `FrameSendToGoogle` is reached from the allowlist
 *     scope, which `frame-bridge` itself pulls in. A mutable dispatcher in a
 *     leaf module keeps that graph acyclic.
 *
 * Before the bridge is installed (the bare-HTML acceptance harness, a frame
 * that never received its port) the relay answers with a named refusal. It
 * never pretends to have worked (Law 4).
 */

export interface HostActionResult {
    ok: boolean;
    value?: unknown;
    error?: string;
}

export type HostActionDispatcher = (
    key: string,
    input: unknown,
) => Promise<HostActionResult>;

const NOT_CONNECTED: HostActionResult = {
    ok: false,
    error:
        "This component is not connected to the page that hosts it, so the " +
        "action could not be sent. Reload the Shape; if it keeps happening, " +
        "the sandbox frame never finished starting up.",
};

let dispatcher: HostActionDispatcher | null = null;

/** Called once by `frame-bridge` when the host's port arrives. */
export function installHostActionDispatcher(next: HostActionDispatcher): void {
    dispatcher = next;
}

/** Ask the host to run an action. Never throws; never fakes success. */
export async function requestHostAction(
    key: string,
    input: unknown,
): Promise<HostActionResult> {
    if (!dispatcher) return NOT_CONNECTED;
    try {
        return await dispatcher(key, input);
    } catch (err) {
        return {
            ok: false,
            error:
                err instanceof Error
                    ? err.message
                    : `The action "${key}" failed for an unknown reason.`,
        };
    }
}

/** True once the frame has a live channel to its host. */
export function isHostActionRelayConnected(): boolean {
    return dispatcher !== null;
}
