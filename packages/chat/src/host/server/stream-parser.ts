/**
 * Server seam (P9) — the NDJSON stream every run reads. Same names the call sites imported from the
 * host's `lib/api/stream-parser`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const parseNdjsonStream = forwardServer("parseNdjsonStream");
