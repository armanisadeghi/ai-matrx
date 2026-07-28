/**
 * THE single way to open a Cartesia TTS websocket from the browser.
 *
 * Wraps the access-token primitive (./accessToken.ts): lazy token on first
 * use, cached thereafter, and a transparent refresh-and-reconnect retry if
 * the token is rejected. Consumers never touch tokens, keys, or the
 * CartesiaClient constructor — they call connectCartesiaTts() and get a
 * connected websocket back.
 */

import { CartesiaClient } from "@cartesia/cartesia-js";
import type CartesiaWebsocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { CARTESIA_API_VERSION } from "./config";
import {
    getCartesiaAccessToken,
    invalidateCartesiaAccessToken,
    isCartesiaAuthError,
} from "./accessToken";

export interface CartesiaTtsSocketOptions {
    container?: string;
    encoding?: string;
    sampleRate?: number;
}

const DEFAULTS: Required<CartesiaTtsSocketOptions> = {
    container: "raw",
    encoding: "pcm_f32le",
    sampleRate: 44100,
};

/** The context object `ws.connect()` resolves with (SDK leaves it untyped). */
export type CartesiaConnectionCtx = Awaited<
    ReturnType<CartesiaWebsocket["connect"]>
>;

function buildWebsocket(
    opts: Required<CartesiaTtsSocketOptions>,
): CartesiaWebsocket {
    const client = new CartesiaClient({
        // MATRX-EXCEPTION: the installed @cartesia/cartesia-js SDK hard-pins
        // `cartesiaVersion` to the stale literal "2024-06-10"; the runtime
        // accepts newer versions fine. Vendor type lag, not our contract.
        cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
    });
    return client.tts.websocket(opts);
}

/**
 * Open and connect a Cartesia TTS websocket. Ensures a valid access token
 * first; if the connect is rejected for auth, silently refreshes the token
 * and retries once with a FRESH socket (a failed socket may be poisoned).
 */
export async function connectCartesiaTts(
    options?: CartesiaTtsSocketOptions,
): Promise<{ ws: CartesiaWebsocket; ctx: CartesiaConnectionCtx }> {
    const opts = { ...DEFAULTS, ...options };

    const attempt = async (token: string) => {
        const ws = buildWebsocket(opts);
        const ctx = await ws.connect({ accessToken: token });
        return { ws, ctx };
    };

    const token = await getCartesiaAccessToken();
    try {
        return await attempt(token);
    } catch (err) {
        if (!isCartesiaAuthError(err)) throw err;
        invalidateCartesiaAccessToken(token);
        const fresh = await getCartesiaAccessToken({ forceRefresh: true });
        return await attempt(fresh);
    }
}
