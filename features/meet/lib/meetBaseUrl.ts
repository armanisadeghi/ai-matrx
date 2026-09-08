"use client";

// features/meet/lib/meetBaseUrl.ts
//
// AIDREAM'S BASE URL FOR `@ai-matrx/meet`, from the ONE place this app already
// resolves it: `resolveBaseUrl` over `apiConfigSlice`, the same machinery every
// `callApi` request and `createMatrxTransport` target use. So the admin
// server-switcher (production / local / custom) moves Meet's `/api/v1/meet/*`
// calls with everything else, and there is no second notion of "where the
// server is".
//
// `MEET_ROUTES` in the package are absolute paths beginning `/api/v1/meet/...`,
// so what belongs here is the ORIGIN, which is exactly what `resolveBaseUrl`
// returns.
//
// `resolveBaseUrl` THROWS when no URL is configured for the selected server
// environment. That is a real misconfiguration and it must not take the whole
// provider tree down mid-call, so it is reported — with the message that
// already names the missing env var — and an empty origin is returned. The
// package's own token client then fails loudly with its remedy rather than the
// app white-screening.

import type { RootState } from "@/lib/redux/store";
import { resolveBaseUrl } from "@/lib/api/call-api";

export function meetBaseUrl(state: RootState): string {
  try {
    return resolveBaseUrl(state);
  } catch (error) {
    console.error(
      `[meet] No aidream base URL is configured, so calls and meetings cannot ` +
        `reach the server: ${(error as Error).message}`,
    );
    return "";
  }
}
