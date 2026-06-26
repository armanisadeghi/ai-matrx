/**
 * GET /api/compute-targets — unified bindable-targets list.
 *
 * Returns the user's sandbox_instances (orchestrator-managed) AND
 * app_instances (matrx-local-registered PCs with active Cloudflare tunnels)
 * in a single shape. Powers the SandboxPanel's "Your computers" +
 * "Sandboxes" two-section picker, the matrx-extend SandboxPickerChip, and
 * the matrx-local desktop picker — one wire shape for every surface.
 *
 * Goes directly against Supabase (same pattern as `/api/sandbox`) — no hop
 * through the Python backend for read traffic. Per-user scoping is enforced
 * by RLS + `user_id` filter.
 *
 * Plan-aware: also returns `max_sandboxes` from
 * `cld_account_tiers.features.max_sandboxes` (custom_limits override wins),
 * so the picker can render the "New sandbox" affordance correctly.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { filesDb } from "@/features/files/filesDb";

const DEVICE_FRESHNESS_WINDOW_MS = 10 * 60 * 1000;

const RENDERABLE_SANDBOX_STATUSES = new Set([
  "running",
  "ready",
  "starting",
  "creating",
  "stopped",
]);

const SANDBOX_STATUS_RANK: Record<string, number> = {
  running: 0,
  ready: 0,
  starting: 1,
  creating: 1,
  stopped: 2,
};

export type ComputeTargetKind = "ec2" | "hosted" | "local-pc";

export interface ComputeTarget {
  id: string;
  kind: ComputeTargetKind;
  name: string;
  status: string;
  is_online: boolean;
  is_this_device: boolean;
  sandbox_id: string | null;
  tier: "ec2" | "hosted" | null;
  template: string | null;
  expires_at: string | null;
  instance_id: string | null;
  tunnel_url: string | null;
  platform: string | null;
  last_seen: string | null;
}

export interface ComputeTargetListResponse {
  targets: ComputeTarget[];
  max_sandboxes: number;
  sandbox_count: number;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  // Parallel load: sandboxes + local PCs + tier resolution.
  const [sandboxResult, appInstanceResult, tierLimit] = await Promise.all([
    supabase
      .from("sandbox_instances")
      .select("id, sandbox_id, status, tier, config, expires_at, updated_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("app_instances")
      .select(
        "id, instance_id, instance_name, hostname, platform, tunnel_url, tunnel_active, last_seen, is_active",
      )
      .eq("user_id", user.id),
    resolveMaxSandboxes(supabase, user.id),
  ]);

  const sandboxes: ComputeTarget[] = [];
  for (const row of sandboxResult.data ?? []) {
    if (!RENDERABLE_SANDBOX_STATUSES.has(row.status ?? "")) continue;
    const config = (row.config as { template?: string } | null) ?? {};
    if (row.tier !== "ec2" && row.tier !== "hosted") {
      console.error(
        `[GET /api/compute-targets] sandbox row ${row.id} has no valid tier (got: ${JSON.stringify(row.tier)}). ` +
          "This row predates the tier column or was created without an explicit tier. " +
          "Falling back to 'ec2' — update the row to suppress this error.",
      );
    }
    const tier: "ec2" | "hosted" =
      row.tier === "ec2" || row.tier === "hosted" ? row.tier : "ec2";
    sandboxes.push({
      id: String(row.id),
      kind: tier,
      name: config.template || row.sandbox_id || "Sandbox",
      status: row.status ?? "stopped",
      is_online: row.status === "running" || row.status === "ready",
      is_this_device: false,
      sandbox_id: row.sandbox_id ?? null,
      tier,
      template: config.template ?? null,
      expires_at: row.expires_at ?? null,
      instance_id: null,
      tunnel_url: null,
      platform: null,
      last_seen: null,
    });
  }

  const now = Date.now();
  const computers: ComputeTarget[] = [];
  for (const row of appInstanceResult.data ?? []) {
    if (row.is_active === false) continue;
    const lastSeenMs = row.last_seen ? new Date(row.last_seen).getTime() : 0;
    const isOnline =
      !!row.tunnel_active &&
      lastSeenMs > 0 &&
      now - lastSeenMs <= DEVICE_FRESHNESS_WINDOW_MS;
    computers.push({
      id: String(row.id),
      kind: "local-pc",
      name: row.instance_name || row.hostname || "My computer",
      status: isOnline ? "online" : "offline",
      is_online: isOnline,
      is_this_device: false,
      sandbox_id: null,
      tier: null,
      template: null,
      expires_at: null,
      instance_id: row.instance_id ?? null,
      tunnel_url: isOnline ? (row.tunnel_url ?? null) : null,
      platform: row.platform ?? null,
      last_seen: row.last_seen ?? null,
    });
  }

  computers.sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
    const ats = a.last_seen ? Date.parse(a.last_seen) : 0;
    const bts = b.last_seen ? Date.parse(b.last_seen) : 0;
    return bts - ats;
  });
  sandboxes.sort((a, b) => {
    const ra = SANDBOX_STATUS_RANK[a.status] ?? 99;
    const rb = SANDBOX_STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    const ats = a.expires_at ? Date.parse(a.expires_at) : 0;
    const bts = b.expires_at ? Date.parse(b.expires_at) : 0;
    return bts - ats;
  });

  const response: ComputeTargetListResponse = {
    targets: [...computers, ...sandboxes],
    max_sandboxes: tierLimit,
    sandbox_count: sandboxes.length,
  };
  return NextResponse.json(response);
}

async function resolveMaxSandboxes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { data: account } = await filesDb(supabase)
    .from("user_account")
    .select("tier_id, custom_limits")
    .eq("user_id", userId)
    .maybeSingle();
  const customLimits =
    (account?.custom_limits as { max_sandboxes?: number } | null) ?? null;
  if (
    customLimits &&
    typeof customLimits.max_sandboxes === "number" &&
    customLimits.max_sandboxes >= 0
  ) {
    return customLimits.max_sandboxes;
  }
  const tierId = account?.tier_id ?? "free";
  const { data: tier } = await filesDb(supabase)
    .from("account_tiers")
    .select("features")
    .eq("id", tierId)
    .maybeSingle();
  const features =
    (tier?.features as { max_sandboxes?: number } | null) ?? null;
  if (
    features &&
    typeof features.max_sandboxes === "number" &&
    features.max_sandboxes >= 0
  ) {
    return features.max_sandboxes;
  }
  return 1;
}
