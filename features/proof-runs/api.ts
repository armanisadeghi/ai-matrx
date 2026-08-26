/**
 * features/proof-runs/api.ts
 *
 * Client for the Python `/proof-runs` API — the platform's expensive checks
 * that prove a feature really works, with provider receipts read back out of
 * the cost ledger (aidream `aidream/services/proof_runs/FEATURE.md`).
 *
 * Compute lives on the Python server, so this calls it DIRECTLY through the
 * canonical `lib/python-client` (never a Next API route). The run endpoint
 * streams NDJSON through `postNdjson`, which already owns the envelope parsing,
 * the compact-event expansion, the request id and the diagnostics sink — this
 * module only narrows the typed data events it cares about.
 */

import { getJson, postNdjson } from "@/lib/python-client";
import type {
  ProofEvaluatedData,
  ProofRunCompletedData,
  ProofRunSkippedData,
  ProofRunStartedData,
  ProofRunStepData,
} from "@/types/python-generated/stream-events";
import type {
  ProofChecksResponse,
  ProofRunDetail,
  ProofRunMode,
  ProofRunsResponse,
} from "@/features/proof-runs/types";

const BASE = "/proof-runs";

export async function fetchProofChecks(
  signal?: AbortSignal,
): Promise<ProofChecksResponse> {
  const { data } = await getJson<ProofChecksResponse>(`${BASE}/checks`, {
    signal,
  });
  return data;
}

export async function fetchProofRuns(
  opts: { slug?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<ProofRunsResponse> {
  const params = new URLSearchParams();
  if (opts.slug) params.set("slug", opts.slug);
  params.set("limit", String(opts.limit ?? 25));
  const { data } = await getJson<ProofRunsResponse>(
    `${BASE}/runs?${params.toString()}`,
    { signal: opts.signal },
  );
  return data;
}

export async function fetchProofRun(
  runId: string,
  signal?: AbortSignal,
): Promise<ProofRunDetail> {
  const { data } = await getJson<ProofRunDetail>(`${BASE}/runs/${runId}`, {
    signal,
  });
  return data;
}

/**
 * Pin one generated payload interface off the `type` discriminant.
 *
 * The generated data union carries `UntypedDataPayload` (an indexed catch-all
 * for events this snapshot has not seen yet), so a literal `switch` on `type`
 * cannot exclude it and every branch stays widened. Checking the discriminant
 * and then asserting to the generated interface is the repo's established
 * idiom for this exact union (`features/pdf/scanner/api.ts`) — the assertion is
 * safe precisely because the discriminant was checked first, and the shape it
 * names is generated from the Python model rather than hand-written here.
 */
function asPayload<T extends { type?: string }>(
  data: { type?: string },
  type: NonNullable<T["type"]>,
): T | null {
  return data.type === type ? (data as T) : null;
}

/**
 * The typed events one proof run emits, in the order a viewer sees them.
 * `skipped` means the GATE declined to run — never a pass, always with a reason.
 */
export type ProofRunEvent =
  | { kind: "started"; data: ProofRunStartedData }
  | { kind: "step"; data: ProofRunStepData }
  | { kind: "proof"; data: ProofEvaluatedData }
  | { kind: "completed"; data: ProofRunCompletedData }
  | { kind: "skipped"; data: ProofRunSkippedData }
  | { kind: "error"; message: string };

/**
 * Run one check and yield each proof as the server decides it.
 *
 * `mode: "auto"` is the honest default — the gate decides whether THIS
 * invocation spends real money (cadence + the monthly ceiling) or replays the
 * recorded payloads. `live` forces the real thing; `replay` never reaches the
 * external boundary.
 */
export async function* runProofCheck(
  slug: string,
  opts: { mode?: ProofRunMode; reason?: string; signal?: AbortSignal } = {},
): AsyncGenerator<ProofRunEvent, void, void> {
  const stream = postNdjson(
    `${BASE}/checks/${slug}/run`,
    { mode: opts.mode ?? "auto", reason: opts.reason ?? "" },
    { signal: opts.signal },
  );
  for await (const envelope of stream) {
    if (envelope.event === "error") {
      yield {
        kind: "error",
        message: envelope.data?.message ?? "The proof run failed",
      };
      continue;
    }
    if (envelope.event !== "data") continue;
    const data = envelope.data;
    if (!data || typeof data !== "object" || !("type" in data)) continue;

    const started = asPayload<ProofRunStartedData>(data, "proof_run_started");
    if (started) {
      yield { kind: "started", data: started };
      continue;
    }
    const step = asPayload<ProofRunStepData>(data, "proof_run_step");
    if (step) {
      yield { kind: "step", data: step };
      continue;
    }
    const proof = asPayload<ProofEvaluatedData>(data, "proof_evaluated");
    if (proof) {
      yield { kind: "proof", data: proof };
      continue;
    }
    const completed = asPayload<ProofRunCompletedData>(
      data,
      "proof_run_completed",
    );
    if (completed) {
      yield { kind: "completed", data: completed };
      continue;
    }
    const skipped = asPayload<ProofRunSkippedData>(data, "proof_run_skipped");
    if (skipped) {
      yield { kind: "skipped", data: skipped };
    }
  }
}
