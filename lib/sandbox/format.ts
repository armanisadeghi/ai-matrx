import type { SandboxInstance, SandboxInstanceRow, SandboxInstanceDecorations } from "@/types/sandbox";

/** PostgreSQL permits infinity timestamps; JavaScript Date does not. */
export function formatSandboxTimestamp(value: string | null): string {
  if (!value) return "—";
  if (value === "infinity") return "No expiry";
  if (value === "-infinity") return "Unbounded past";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : date.toLocaleString();
}

/** User-facing identity with the immutable orchestrator id as a safe fallback. */
export function sandboxDisplayName(
  instance: Pick<SandboxInstance, "name" | "sandbox_id">,
): string {
  return instance.name?.trim() || instance.sandbox_id;
}

/**
 * Human-readable, multi-line summary of a single sandbox instance — the
 * "Copy" (human) flavor shared by every sandbox surface (admin table, user
 * list, detail page). The agent flavor dumps the full row as JSON via
 * `buildAgentPayload`, so this only needs to cover the fields a human scans.
 */
export function sandboxInstanceSummary(i: SandboxInstanceRow & Partial<SandboxInstanceDecorations>): string {
  const ttlH = Math.floor(i.ttl_seconds / 3600);
  const ttlM = Math.floor((i.ttl_seconds % 3600) / 60);
  return [
    `Sandbox: ${sandboxDisplayName(i)}`,
    i.name ? `Sandbox ID: ${i.sandbox_id}` : null,
    `Status: ${i.status}`,
    `Tier: ${i.tier ?? "—"}`,
    `User ID: ${i.user_id}`,
    `Instance ID: ${i.id}`,
    i.container_id ? `Container ID: ${i.container_id}` : null,
    i.proxy_url ? `Proxy URL: ${i.proxy_url}` : null,
    `Created: ${formatSandboxTimestamp(i.created_at)}`,
    `Expires: ${formatSandboxTimestamp(i.expires_at)}`,
    `TTL: ${i.ttl_seconds}s (${ttlH}h ${ttlM}m)`,
    `Hot Path: ${i.hot_path ?? "—"}`,
    `Cold Path: ${i.cold_path ?? "—"}`,
    i.last_heartbeat_at
      ? `Last Heartbeat: ${formatSandboxTimestamp(i.last_heartbeat_at)}`
      : null,
    i.stop_reason ? `Stop Reason: ${i.stop_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
