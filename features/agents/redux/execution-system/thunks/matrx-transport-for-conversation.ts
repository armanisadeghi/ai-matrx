/**
 * matrx-transport-for-conversation.ts
 *
 * The CONVERSATION-SCOPED `MatrxTransport` — the host port implementation for
 * package calls that belong to one conversation's backend channel. Base URL
 * and credentials come from the SAME resolver the execute/resume thunks use
 * (`resolveBackendForConversation`: global / sandbox override / local engine /
 * EC2-dedicated, Supabase JWT or guest fingerprint), so a package-driven call
 * can never route differently from the conversation's own stream.
 *
 * Parity notes vs the global transport (`lib/api/matrx-transport.ts`):
 *   - NO `X-Organization-Id` header — `runAiStream`'s conversation calls send
 *     the org in the BODY only, and this transport matches that wire exactly.
 *   - Same fetch pipeline otherwise (AI-version path transform, v2→v1
 *     fallback, uncapped total timeout, capture sinks) via
 *     `createMatrxTransportFromTarget`.
 *
 * NOT yet the carrier of the execute/resume/rejoin stream flows — those stay
 * on `runAiStream` (deployment-drain retry ladder, drift assertion,
 * `processStream` raw-Response ownership); see the blocked-flows record in
 * `features/agents/FEATURE.md`.
 */

import type { RootState } from "@/lib/redux/store";
import type { MatrxTransport } from "@ai-matrx/agents/matrx";
import {
  createMatrxTransportFromTarget,
  type MatrxTransportOptions,
} from "@/lib/api/matrx-transport";
import { resolveBackendForConversation } from "./resolve-base-url";

/**
 * Build the transport for one conversation. Resolution happens fresh on
 * EVERY call (server toggle, sandbox binding, token refresh all picked up),
 * exactly like the execute thunks re-resolve per turn. Throws when no backend
 * URL is configured — the same misconfiguration the thunks surface loudly.
 */
export function createMatrxTransportForConversation(
  getState: () => RootState,
  conversationId: string,
  options: MatrxTransportOptions = {},
): MatrxTransport {
  return createMatrxTransportFromTarget(
    getState,
    (state) => {
      const backend = resolveBackendForConversation(state, conversationId);
      if (!backend) {
        throw new Error(
          `[matrx-transport] No backend URL configured for conversation ${conversationId}. ` +
            `Set the corresponding NEXT_PUBLIC_BACKEND_URL_* env variable, ` +
            `or enter a custom URL via the admin indicator.`,
        );
      }
      // The resolver bundles Content-Type for the thunks' own fetch; the
      // package owns wire headers, so only credentials are policy here.
      const { "Content-Type": _wireOwned, ...credentialHeaders } =
        backend.headers;
      return {
        baseUrl: backend.baseUrl,
        policyHeaders: credentialHeaders,
        channel: backend.channel,
      };
    },
    { source: "matrxTransport:conversation", ...options },
  );
}
