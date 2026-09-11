/** Typed server-only handoff from the signed Twilio webhook to aidream. */

import "server-only";

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { createAdminClient } from "@/utils/supabase/adminClient";

export const CONVERSATION_RELAY_PUBLIC_URL =
  "wss://server.app.matrxserver.com/communications/voice/conversation-relay";

export interface PrepareConversationRelaySessionInput {
  signedUrl: string;
  signature: string;
  parameters: Record<string, string>;
}

interface ConversationRelaySessionReference {
  session_id: string;
  chat_conversation_id: string;
  session_reference: string;
  expires_at: string;
}

/**
 * Aidream independently revalidates the provider HMAC before resolving the
 * Mandate, creating the canonical chat conversation, or issuing a reference.
 */
export async function prepareConversationRelaySession(
  input: PrepareConversationRelaySessionInput,
): Promise<ConversationRelaySessionReference> {
  const response = await fetch(
    `${AIDREAM_PRODUCTION_URL.replace(/\/$/, "")}/communications/voice/conversation-relay/session-reference`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signed_url: input.signedUrl,
        signature: input.signature,
        parameters: input.parameters,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `ConversationRelay session preparation failed with HTTP ${response.status}`,
    );
  }
  return (await response.json()) as ConversationRelaySessionReference;
}

/** Persist a relay handoff failure without retaining signed webhook material. */
export async function recordConversationRelayPreparationFailure(
  error: unknown,
): Promise<void> {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  const { error: insertError } = await createAdminClient()
    .schema("ops")
    .from("system_error")
    .insert({
      kind: "voice:conversation-relay-preparation",
      error_text:
        "ConversationRelay session preparation failed after consented recording began.",
      error_type: errorType,
      metadata: {
        boundary: "conversation_relay_session_preparation",
        provider: "twilio",
        recording_started: true,
      },
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      route: "/api/webhooks/twilio/voice",
      source_app: "matrx-frontend",
    });
  if (insertError) {
    throw new Error(
      `Failed to capture ConversationRelay preparation failure: ${insertError.message}`,
    );
  }
}
