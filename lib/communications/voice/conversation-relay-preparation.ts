/** Typed server-only handoff from the signed Twilio webhook to aidream. */

import "server-only";

import { apiPost } from "@/lib/api/typed-client";

export const CONVERSATION_RELAY_PUBLIC_URL =
  "wss://server.app.matrxserver.com/communications/voice/conversation-relay";

export interface PrepareConversationRelaySessionInput {
  signedUrl: string;
  signature: string;
  parameters: Record<string, string>;
}

/**
 * Aidream independently revalidates the provider HMAC before resolving the
 * Mandate, creating the canonical chat conversation, or issuing a reference.
 */
export async function prepareConversationRelaySession(
  input: PrepareConversationRelaySessionInput,
) {
  const { data } = await apiPost(
    "/communications/voice/conversation-relay/session-reference",
    {
      signed_url: input.signedUrl,
      signature: input.signature,
      parameters: input.parameters,
    },
  );
  return data;
}
