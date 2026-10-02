/**
 * Server seam (P9) — request body types. Same names the call sites imported from the
 * host's `lib/api/types`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import type { ChatServerTypes } from "../server";


export type LLMParams = ChatServerTypes["LLMParams"];
