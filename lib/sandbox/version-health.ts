import type { SandboxTier, SandboxVersionHealth } from "@/types/sandbox";

export type DriftBox = {
  sandbox_id: string;
  template: string | null;
  running_image_id: string | null;
  running_version: string | null;
  current_image_id: string | null;
  current_version: string | null;
  current_image_available: boolean;
  drifted: boolean | null;
  reason: string | null;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function hasImageId(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Returns null when an upstream drift payload cannot be trusted. */
export function parseDriftBoxes(payload: unknown): DriftBox[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.boxes)) return null;
  const boxes: DriftBox[] = [];
  for (const candidate of payload.boxes) {
    if (!isRecord(candidate) || typeof candidate.sandbox_id !== "string") continue;
    boxes.push({
      sandbox_id: candidate.sandbox_id,
      template: stringOrNull(candidate.template),
      running_image_id: stringOrNull(candidate.running_image_id),
      running_version: stringOrNull(candidate.running_version),
      current_image_id: stringOrNull(candidate.current_image_id),
      current_version: stringOrNull(candidate.current_version),
      current_image_available: candidate.current_image_available === true,
      // Missing or malformed drifted is intentionally not false: no check has
      // established this instance is current.
      drifted: typeof candidate.drifted === "boolean" ? candidate.drifted : null,
      reason: stringOrNull(candidate.reason),
    });
  }
  return boxes;
}

function isStopped(status: string): boolean {
  return ["stopped", "failed", "expired", "shutting_down"].includes(status);
}

export function buildSandboxVersionHealth({
  sandboxId,
  tier,
  instanceStatus,
  boxes,
  canMigrate,
  migrationActionReason,
  managerVersion,
}: {
  sandboxId: string;
  tier: SandboxTier;
  instanceStatus: string;
  boxes: DriftBox[] | null;
  canMigrate: boolean;
  migrationActionReason: string | null;
  managerVersion: string | null;
}): SandboxVersionHealth {
  if (boxes === null) {
    return unknownHealth(
      sandboxId,
      tier,
      "The sandbox manager returned an invalid image freshness report.",
      managerVersion,
      migrationActionReason,
    );
  }
  const box = boxes.find((candidate) => candidate.sandbox_id === sandboxId);
  if (!box) {
    return unknownHealth(
      sandboxId,
      tier,
      isStopped(instanceStatus)
        ? "The sandbox is not running, so its image cannot be checked."
        : "No running container was found in the orchestrator drift report.",
      managerVersion,
      migrationActionReason,
      isStopped(instanceStatus) ? "not_running" : "unknown",
    );
  }

  const exactIds =
    box.current_image_available &&
    hasImageId(box.running_image_id) &&
    hasImageId(box.current_image_id);
  const status: SandboxVersionHealth["status"] =
    exactIds && box.drifted && box.running_image_id !== box.current_image_id
      ? "outdated"
      : exactIds && box.drifted === false && box.running_image_id === box.current_image_id
        ? "current"
        : "unknown";
  const reason =
    status === "outdated"
      ? "A newer sandbox image is available."
      : status === "current"
        ? "This sandbox is running the manager's current image."
        : "The manager could not provide a complete exact image-ID comparison.";

  return {
    supported: true,
    sandbox_id: sandboxId,
    template: box.template,
    tier,
    status,
    reason,
    running_image_id: box.running_image_id,
    running_version: box.running_version,
    current_image_id: box.current_image_id,
    current_version: box.current_version,
    current_image_available: box.current_image_available,
    can_migrate: status === "outdated" && canMigrate,
    manager_version: managerVersion,
    migration_action_reason: migrationActionReason,
  };
}

function unknownHealth(
  sandboxId: string,
  tier: SandboxTier,
  reason: string,
  managerVersion: string | null,
  migrationActionReason: string | null,
  status: "unknown" | "not_running" = "unknown",
): SandboxVersionHealth {
  return {
    supported: true,
    sandbox_id: sandboxId,
    template: null,
    tier,
    status,
    reason,
    running_image_id: null,
    running_version: null,
    current_image_id: null,
    current_version: null,
    current_image_available: false,
    can_migrate: false,
    manager_version: managerVersion,
    migration_action_reason: migrationActionReason,
  };
}
