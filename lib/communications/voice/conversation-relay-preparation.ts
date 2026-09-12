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

export type ConversationRelayPreparationFailureCode =
  "http_response" | "invalid_response" | "transport_failure";

/**
 * Deliberately bounded failure facts that are safe to retain in ops telemetry.
 * Do not attach an upstream body, signed request data, or a thrown error message.
 */
export class ConversationRelayPreparationFailure extends Error {
  readonly code: ConversationRelayPreparationFailureCode;
  readonly httpStatus: number | null;

  constructor(
    code: ConversationRelayPreparationFailureCode,
    httpStatus: number | null = null,
  ) {
    super("ConversationRelay session preparation failed");
    this.name = "ConversationRelayPreparationFailure";
    this.code = code;
    this.httpStatus =
      httpStatus !== null &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
        ? httpStatus
        : null;
  }
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
  let response: Response;
  try {
    response = await fetch(
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
  } catch {
    throw new ConversationRelayPreparationFailure("transport_failure");
  }
  if (!response.ok) {
    throw new ConversationRelayPreparationFailure(
      "http_response",
      response.status,
    );
  }
  let prepared: unknown;
  try {
    prepared = await response.json();
  } catch {
    throw new ConversationRelayPreparationFailure("invalid_response");
  }
  if (!isPreparationResponse(prepared)) {
    throw new ConversationRelayPreparationFailure("invalid_response");
  }
  return prepared;
}

/** Persist a relay handoff failure without retaining signed webhook material. */
export async function recordConversationRelayPreparationFailure(
  error: unknown,
  organizationId: string,
): Promise<void> {
  const failure =
    error instanceof ConversationRelayPreparationFailure
      ? error
      : new ConversationRelayPreparationFailure("transport_failure");
  const { error: insertError } = await createAdminClient()
    .schema("ops")
    .from("system_error")
    .insert({
      kind: "voice:conversation-relay-preparation",
      error_text:
        "ConversationRelay session preparation failed after consented recording began.",
      error_type: "ConversationRelayPreparationFailure",
      metadata: {
        boundary: "conversation_relay_session_preparation",
        failure_code: failure.code,
        http_status: failure.httpStatus,
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
