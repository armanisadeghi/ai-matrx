/** Typed server-only handoff from the signed Twilio webhook to aidream. */

import "server-only";

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";
import { createAdminClient } from "@/utils/supabase/adminClient";

export const CONVERSATION_RELAY_PUBLIC_URL =
  "wss://server.app.matrxserver.com/communications/voice/conversation-relay";
export const CONVERSATION_RELAY_PREPARATION_TIMEOUT_MS = 5_000;

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

function isSessionReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 256 &&
    value.trim().length === value.length
  );
}

function isPreparationResponse(
  value: unknown,
): value is ConversationRelaySessionReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return (
    isRfc4122Uuid(response.session_id) &&
    isRfc4122Uuid(response.chat_conversation_id) &&
    isSessionReference(response.session_reference) &&
    typeof response.expires_at === "string" &&
    Number.isFinite(Date.parse(response.expires_at))
  );
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
      signal: AbortSignal.timeout(CONVERSATION_RELAY_PREPARATION_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(
      `ConversationRelay session preparation failed with HTTP ${response.status}`,
    );
  }
  const prepared: unknown = await response.json();
  if (!isPreparationResponse(prepared)) {
    throw new Error(
      "ConversationRelay session preparation returned an invalid response",
    );
  }
  return prepared;
}

/** Persist a relay handoff failure without retaining signed webhook material. */
export async function recordConversationRelayPreparationFailure(
  error: unknown,
  organizationId: string,
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
      organization_id: organizationId,
      route: "/api/webhooks/twilio/voice",
      source_app: "matrx-frontend",
    });
  if (insertError) {
    throw new Error(
      `Failed to capture ConversationRelay preparation failure: ${insertError.message}`,
    );
  }
}
