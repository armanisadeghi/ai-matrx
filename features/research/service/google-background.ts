import { getJson, postJson } from "@/lib/python-client";

export type GoogleBackgroundModel =
  | "deep-research-preview-04-2026"
  | "deep-research-max-preview-04-2026"
  | "antigravity-preview-05-2026";

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
  model: GoogleBackgroundModel;
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
