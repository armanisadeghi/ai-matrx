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

export const DISCOVERY_STEP_ORDER = [
  "business_model",
  "ideal_customer",
  "money_map",
  "offerings",
  "offering_values",
  "proposed_setup",
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

export async function getDiscoveryStatus(siteId: string): Promise<DiscoveryStatus> {
  const { data, error } = await apiGet("/seo/keywords/discovery/status", {
    query: { site_id: siteId },
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not read discovery status");
  }
  return data as unknown as DiscoveryStatus;
}
