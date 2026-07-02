import { CartesiaClient } from "@cartesia/cartesia-js";
import { CARTESIA_API_VERSION } from "./config";

const cartesia = new CartesiaClient({
    apiKey: process.env.NEXT_PUBLIC_CARTESIA_API_KEY,
    // MATRX-EXCEPTION: Pin to the latest Cartesia API version (generation_config:
    // speed / volume / emotion). @cartesia/cartesia-js@2.2.9's Client.d.ts still
    // types `cartesiaVersion` as the single stale literal "2024-06-10" — our
    // value is correct, the third-party SDK's type has not caught up.
    cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
});


export default cartesia;
