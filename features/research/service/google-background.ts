import { getJson, postJson } from "@/lib/python-client";
import {
  dbAuthoredMandateKey,
  type AnyMandateKey,
} from "@/features/mandates/mandate-key";

/**
 * The JOBS the background-agent card can start. The person picks a job; the
 * job's MANDATE (declared in aidream `services/google_specialized.py`) picks
 * the model on the server. Until 2026-09-25 this was a union of raw Google
 * model ids sent as `model` — a model choice outside the mandate system.
 *
 * `dbAuthoredMandateKey`: declared in aidream but newer than the installed
 * `@ai-matrx/agents`; allowlisted in scripts/mandate-keys-allowlist.json.
 * Switch to MANDATE_KEYS.research_client__google_* once the package publishes.
 */
export const GOOGLE_BACKGROUND_JOBS = [
  {
    mandateKey: dbAuthoredMandateKey("research_client.google_deep_research"),
    label: "Deep Research",
  },
  {
    mandateKey: dbAuthoredMandateKey("research_client.google_deep_research_max"),
    label: "Deep Research Max",
  },
  {
    mandateKey: dbAuthoredMandateKey("research_client.google_sandbox_task"),
    label: "Antigravity sandbox agent",
  },
] as const;

export interface GoogleBackgroundInteractionView {
  execution_id: string;
  status: string;
  interaction_id: string | null;
  provider_status: string | null;
  steps: Record<string, unknown>[];
  outputs: Record<string, unknown>[];
  error: Record<string, unknown> | null;
}

export async function startGoogleBackgroundInteraction(body: {
  /** One of GOOGLE_BACKGROUND_JOBS' mandate keys. */
  mandate_key: AnyMandateKey;
  input: string;
  idempotency_key: string;
}): Promise<GoogleBackgroundInteractionView> {
  const { data } = await postJson<GoogleBackgroundInteractionView>(
    "/ai/google/background-interactions",
    body,
  );
  return data;
}

export async function getGoogleBackgroundInteraction(
  executionId: string,
): Promise<GoogleBackgroundInteractionView> {
  const { data } = await getJson<GoogleBackgroundInteractionView>(
    `/ai/google/background-interactions/${encodeURIComponent(executionId)}`,
  );
  return data;
}
