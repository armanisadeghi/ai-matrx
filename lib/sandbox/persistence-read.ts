import {
  orchestratorJsonHeaders,
  resolveOrchestratorByTier,
} from "@/lib/sandbox/orchestrator-routing";
import type { SandboxTier, UserPersistenceInfo } from "@/types/sandbox";

// KNOB MIRROR of platform.feature_knob "infrastructure.sandbox" "persistence_read_timeout_ms" —
// this module runs inside a Next API route and the repo's knob reader
// (lib/knobs/featureKnobs.ts) is browser-only; there is no server-side
// resolution API here yet. Change the row, then re-mirror this literal.
export const PERSISTENCE_READ_TIMEOUT_MS = 8_000;

type PersistenceWirePayload = {
  user_id: string;
  tier: SandboxTier;
  volume_name: string | null;
  volume_bytes: number | null;
  volume_bytes_known: boolean;
  s3_bucket: string | null;
  s3_hot_prefix: string | null;
  s3_cold_prefix: string | null;
  sandboxes_total: number;
  sandboxes_active: number;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Refuses a payload unless it is the complete canonical orchestrator shape. */
export function parsePersistenceWirePayload(
  tier: SandboxTier,
  userId: string,
  payload: unknown,
): PersistenceWirePayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return null;
  const body = payload as Record<string, unknown>;
  const volumeBytes = body.volume_bytes;
  const validBytes =
    volumeBytes === null ||
    (typeof volumeBytes === "number" &&
      Number.isFinite(volumeBytes) &&
      volumeBytes >= 0);

  if (
    body.user_id !== userId ||
    body.tier !== tier ||
    !isNullableString(body.volume_name) ||
    !validBytes ||
    typeof body.volume_bytes_known !== "boolean" ||
    body.volume_bytes_known !== (typeof volumeBytes === "number") ||
    !isNullableString(body.s3_bucket) ||
    !isNullableString(body.s3_hot_prefix) ||
    !isNullableString(body.s3_cold_prefix) ||
    !isNonNegativeInteger(body.sandboxes_total) ||
    !isNonNegativeInteger(body.sandboxes_active) ||
    body.sandboxes_active > body.sandboxes_total
  ) {
    return null;
  }

  return body as PersistenceWirePayload;
}

export function normalizePersistenceInfo(
  tier: SandboxTier,
  userId: string,
  payload: unknown,
): UserPersistenceInfo | null {
  const body = parsePersistenceWirePayload(tier, userId, payload);
  if (!body) return null;
  return {
    user_id: userId,
    tier,
    status: "available",
    volume_name: body.volume_name,
    current_size_bytes: body.volume_bytes,
    sandbox_count: body.sandboxes_total,
    active_sandbox_count: body.sandboxes_active,
    s3_prefix: body.s3_hot_prefix,
  };
}

export async function readPersistenceTier(
  tier: SandboxTier,
  userId: string,
): Promise<UserPersistenceInfo> {
  const target = resolveOrchestratorByTier(tier);
  if (!target.apiKey) {
    return {
      user_id: userId,
      tier,
      status: "not_configured",
      error: "This storage service is not configured.",
      current_size_bytes: null,
    };
  }

  try {
    const response = await fetch(
      `${target.url}/users/${encodeURIComponent(userId)}/persistence`,
      {
        headers: orchestratorJsonHeaders(target),
        signal: AbortSignal.timeout(PERSISTENCE_READ_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      return {
        user_id: userId,
        tier,
        status: "unavailable",
        error: `Storage service returned ${response.status}.`,
        current_size_bytes: null,
      };
    }
    const normalized = normalizePersistenceInfo(
      tier,
      userId,
      await response.json(),
    );
    if (normalized) return normalized;
    return {
      user_id: userId,
      tier,
      status: "unavailable",
      error: "Storage service returned invalid data.",
      current_size_bytes: null,
    };
  } catch (error) {
    const timedOut =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "TimeoutError";
    return {
      user_id: userId,
      tier,
      status: "unavailable",
      error: timedOut
        ? "Storage service did not respond in time."
        : "Storage service could not be reached.",
      current_size_bytes: null,
    };
  }
}
