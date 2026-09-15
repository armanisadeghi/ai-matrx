/**
 * Classifies lifecycle HTTP replies without mistaking an ambiguous upstream
 * outcome for a completed failure. The routes deliberately return this shape
 * after they lose contact while verifying stop/delete state.
 */
export type SandboxLifecycleResponse =
  | { kind: "success"; payload: Record<string, unknown> | null }
  | { kind: "outcome_unknown"; message: string }
  | { kind: "failure"; message: string };

export interface SandboxLifecycleHttpResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export async function classifySandboxLifecycleResponse(
  response: SandboxLifecycleHttpResponse,
  fallback: string,
): Promise<SandboxLifecycleResponse> {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = asRecord(await response.json());
  } catch {
    // DELETE 204 is a successful, intentionally empty response.
  }
  if (response.ok) return { kind: "success", payload };
  const message = typeof payload?.error === "string" ? payload.error : fallback;
  if (payload?.status === "outcome_unknown") {
    return { kind: "outcome_unknown", message };
  }
  return { kind: "failure", message };
}

/** A rejected fetch has no receipt, so instruct reconciliation instead of lying. */
export function sandboxLifecycleTransportUnknown(
  action: string,
): Extract<SandboxLifecycleResponse, { kind: "outcome_unknown" }> {
  return {
    kind: "outcome_unknown",
    message: `Could not confirm whether sandbox ${action} completed. Refresh this sandbox while its state is checked.`,
  };
}

export function sandboxLifecycleMessage(
  result: SandboxLifecycleResponse,
): string {
  return "message" in result ? result.message : "Sandbox lifecycle response was incomplete.";
}
