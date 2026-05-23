import { CartesiaClient } from "@cartesia/cartesia-js";
import { CARTESIA_API_VERSION } from "./config";

const cartesia = new CartesiaClient({
    apiKey: process.env.NEXT_PUBLIC_CARTESIA_API_KEY,
    // Pin to the latest Cartesia API version (generation_config: speed / volume
    // / emotion). The SDK's option type lags the released version, so cast.
    cartesiaVersion: CARTESIA_API_VERSION as unknown as "2024-06-10",
});


export default cartesia;
