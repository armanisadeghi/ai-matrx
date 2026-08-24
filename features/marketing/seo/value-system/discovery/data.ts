/**
 * Business Discovery Ladder — data layer (KI-040).
 *
 * The ladder's truth is SERVER state: each rung is a durable command run on
 * the `seo.collection_run` ledger, and this file reads the one status
 * endpoint that projects them. Nothing here caches a rung's artifact in
 * client memory beyond react-query's window — a refresh must show exactly
 * what the ledger holds.
 */

import { apiGet } from "@/lib/api/typed-client";
import { isJsonObject } from "@/types/json";

export const DISCOVERY_STEP_ORDER = [
  "business_model",
  "ideal_customer",
  "money_map",
  "offerings",
  "offering_values",
  "proposed_setup",
  // KI-031 — the ONE rung with no prerequisite. A site that has told the AI
  // nothing about itself has usually climbed no ladder either, so this reads
  // the site cold and is merely BRIEFED by steps 1-3 when they exist.
  "guidelines_draft",
] as const;

export type DiscoveryStepKey = (typeof DISCOVERY_STEP_ORDER)[number];

export interface DiscoveryStepStatus {
  step: DiscoveryStepKey;
  implemented: boolean;
  run_id: string | null;
  status: string | null;
  completed_at: string | null;
  artifact: Record<string, unknown> | null;
}

export interface DiscoveryStatus {
  site_id: string;
  steps: DiscoveryStepStatus[];
}

function isDiscoveryStepKey(value: unknown): value is DiscoveryStepKey {
  return (
    typeof value === "string" &&
    (DISCOVERY_STEP_ORDER as readonly string[]).includes(value)
  );
}

function parseDiscoveryStepStatus(value: unknown): DiscoveryStepStatus {
  if (!isJsonObject(value) || !isDiscoveryStepKey(value.step)) {
    throw new Error("Discovery status returned an unexpected step shape");
  }
  const artifact = value.artifact;
  return {
    step: value.step,
    implemented: value.implemented === true,
    run_id: typeof value.run_id === "string" ? value.run_id : null,
    status: typeof value.status === "string" ? value.status : null,
    completed_at:
      typeof value.completed_at === "string" ? value.completed_at : null,
    artifact: isJsonObject(artifact) ? artifact : null,
  };
}

function parseDiscoveryStatus(data: unknown): DiscoveryStatus {
  if (
    !isJsonObject(data) ||
    typeof data.site_id !== "string" ||
    !Array.isArray(data.steps)
  ) {
    // A shapeless answer must never render as "nothing has run" — that is
    // the silent-empty class. Scream instead.
    throw new Error("Discovery status returned an unexpected shape");
  }
  return {
    site_id: data.site_id,
    steps: data.steps.map(parseDiscoveryStepStatus),
  };
}

export async function getDiscoveryStatus(siteId: string): Promise<DiscoveryStatus> {
  // `apiGet` throws on any non-OK response; a resolved call IS the data.
  // The OpenAPI contract types this as an open object (`dict[str, Any]`);
  // field-by-field parse is the ingress, never a whole-payload cast.
  const { data } = await apiGet("/seo/keywords/discovery/status", {
    query: { site_id: siteId },
  });
  return parseDiscoveryStatus(data);
}
