/** Server-side read of the public, secret-free ConversationRelay launch facts. */

import "server-only";

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";

const READINESS_PATH = "/communications/voice/conversation-relay/readiness";

export interface ConversationRelayRuntimeReadiness {
  public_route_mounted: boolean;
  code_switch_enabled: boolean;
  provider_switch_enabled: boolean;
  program_switch_enabled: boolean;
  owned_number_routed: boolean;
  routing_configuration_ready: boolean;
  owner_beta_ready: boolean;
}

function isRuntimeReadiness(
  value: unknown,
): value is ConversationRelayRuntimeReadiness {
  if (typeof value !== "object" || value === null) return false;
  return [
    "public_route_mounted",
    "code_switch_enabled",
    "provider_switch_enabled",
    "program_switch_enabled",
    "owned_number_routed",
    "routing_configuration_ready",
    "owner_beta_ready",
  ].every(
    (key) => typeof (value as Record<string, unknown>)[key] === "boolean",
  );
}

export async function getConversationRelayRuntimeReadiness(): Promise<ConversationRelayRuntimeReadiness> {
  const response = await fetch(
    `${AIDREAM_PRODUCTION_URL.replace(/\/$/, "")}${READINESS_PATH}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(
      `ConversationRelay readiness failed with HTTP ${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  if (!isRuntimeReadiness(payload)) {
    throw new Error(
      "ConversationRelay readiness response has an invalid shape",
    );
  }
  return payload;
}
