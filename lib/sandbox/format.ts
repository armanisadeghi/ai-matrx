import type { SandboxInstance } from "@/types/sandbox";

/**
 * Human-readable, multi-line summary of a single sandbox instance — the
 * "Copy" (human) flavor shared by every sandbox surface (admin table, user
 * list, detail page). The agent flavor dumps the full row as JSON via
 * `buildAgentPayload`, so this only needs to cover the fields a human scans.
 */
export function sandboxInstanceSummary(i: SandboxInstance): string {
  const ttlH = Math.floor(i.ttl_seconds / 3600);
  const ttlM = Math.floor((i.ttl_seconds % 3600) / 60);
  return [
    `Sandbox: ${i.sandbox_id}`,
    `Status: ${i.status}`,
    `Tier: ${i.tier ?? "—"}`,
    `User ID: ${i.user_id}`,
    `Instance ID: ${i.id}`,
    i.container_id ? `Container ID: ${i.container_id}` : null,
    i.proxy_url ? `Proxy URL: ${i.proxy_url}` : null,
    `Created: ${new Date(i.created_at).toLocaleString()}`,
    `Expires: ${i.expires_at ? new Date(i.expires_at).toLocaleString() : "—"}`,
    `TTL: ${i.ttl_seconds}s (${ttlH}h ${ttlM}m)`,
    `Hot Path: ${i.hot_path ?? "—"}`,
    `Cold Path: ${i.cold_path ?? "—"}`,
    i.last_heartbeat_at
      ? `Last Heartbeat: ${new Date(i.last_heartbeat_at).toLocaleString()}`
      : null,
    i.stop_reason ? `Stop Reason: ${i.stop_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
