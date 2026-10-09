/**
 * frame-network — what `fetch` and `XMLHttpRequest` MEAN inside the sandbox
 * frame: nothing. The frame's CSP is `connect-src 'none'`, and everything a
 * Shape component needs from the server goes through `runAction`.
 *
 * Library code still CONTAINS network calls it would make on its own (the
 * shared copy menu's markdown engine downloads citation styles; export libs
 * probe for fonts). The build REPLACES both globals with these stand-ins
 * (esbuild `define` + `inject`, the frame-storage precedent), so the served
 * bytes hold no real network door — the artifact audit refuses the real names
 * — and a call announces itself with the reason instead of failing silently.
 */

const REASON =
    "A Shape component cannot reach the network from its sandbox frame; it asks the platform through runAction.";

let announced = false;
function announce(what: string): void {
    if (announced) return;
    announced = true;
    // eslint-disable-next-line no-console
    console.warn(`[kind-sandbox] ${what} refused. ${REASON}`);
}

export const __matrxFrameFetch = (input: unknown): Promise<never> => {
    announce(`fetch(${typeof input === "string" ? input : "…"})`);
    return Promise.reject(new TypeError(REASON));
};

export class __matrxFrameXhr {
    constructor() {
        announce("XMLHttpRequest");
        throw new TypeError(REASON);
    }
}
