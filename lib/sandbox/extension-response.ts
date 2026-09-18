import type { SandboxInstance } from "@/types/sandbox";

export const SANDBOX_EXTENSION_UNKNOWN_MESSAGE =
  "Could not confirm extension; refresh before retrying";

export type SandboxExtensionResponse =
  | { kind: "success"; instance: SandboxInstance }
  | { kind: "refused"; message: string }
  | { kind: "outcome_unknown"; message: string };

function isConfirmedExtension(
  payload: unknown,
  expectedId: string,
): payload is { instance: SandboxInstance } {
  if (!payload || typeof payload !== "object") return false;
  const instance = (payload as { instance?: unknown }).instance;
  if (!instance || typeof instance !== "object") return false;
  const { id, expires_at } = instance as {
    id?: unknown;
    expires_at?: unknown;
  };
  return (
    id === expectedId &&
    typeof expires_at === "string" &&
    Number.isFinite(Date.parse(expires_at))
  );
}

async function refusalMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    // A refusal is still definitive even when its body is empty or malformed.
  }
  return `Extension refused (${response.status})`;
}

/**
 * Sends the one non-idempotent sandbox extension request and classifies only
 * confirmed successes as successful. Unknown outcomes deliberately do not
 * retry: a transport loss may have already added time upstream.
 */
export async function requestSandboxExtension(
  id: string,
  additionalSeconds: number,
): Promise<SandboxExtensionResponse> {
  let response: Response;
  try {
    response = await fetch(`/api/sandbox/${id}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: additionalSeconds }),
    });
  } catch {
    return {
      kind: "outcome_unknown",
      message: SANDBOX_EXTENSION_UNKNOWN_MESSAGE,
    };
  }

  if (response.status >= 400 && response.status < 500) {
    return { kind: "refused", message: await refusalMessage(response) };
  }
  if (!response.ok) {
    return {
      kind: "outcome_unknown",
      message: SANDBOX_EXTENSION_UNKNOWN_MESSAGE,
    };
  }

  try {
    const payload: unknown = await response.json();
    if (isConfirmedExtension(payload, id)) {
      return { kind: "success", instance: payload.instance };
    }
  } catch {
    // A successful HTTP status without a verifiable authoritative row is not
    // proof that this non-idempotent operation failed or succeeded.
  }
  return {
    kind: "outcome_unknown",
    message: SANDBOX_EXTENSION_UNKNOWN_MESSAGE,
  };
}
