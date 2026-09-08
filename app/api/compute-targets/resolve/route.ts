/**
 * POST /api/compute-targets/resolve — turn a {kind, id} ref into the full
 * sandbox-binding payload the agent loop already consumes (the existing
 * `sandbox` request field). The web client never sees the raw orchestrator
 * token or the tunnel URL — both are resolved here per request.
 *
 * For ec2/hosted sandboxes: calls the orchestrator's `/agent-binding` to
 * mint a fresh sandbox-scoped HMAC token.
 *
 * For local-pc: builds an aidream-proxy URL of the form
 * `{AIDREAM_BASE_URL}/api/local-proxy/{app_instance_id}` and uses the
 * user's Supabase session JWT as the access_token. aidream's reverse-proxy
 * validates the JWT, confirms ownership, and forwards to the user's
 * matrx-local engine over its Cloudflare tunnel.
 */

import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { resolveOrchestratorByTier } from "@/lib/sandbox/orchestrator-routing";
import type { components } from "@/types/python-generated/api-types";
import { isJsonObject } from "@/types/json";

export type SandboxBindingPayload = Required<components["schemas"]["SandboxBindingRequest"]>;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const kind = isJsonObject(body) ? body.kind : null;
  const id = isJsonObject(body) ? body.id : null;
  if (typeof kind !== "string" || typeof id !== "string" || !kind || !id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (kind === "ec2" || kind === "hosted") {
    const { data: row, error } = await supabase
      .from("sandbox_instances")
      .select("id, sandbox_id, status, tier")
      .is("deleted_at", null)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "sandbox_not_found" }, { status: 404 });
    }
    if (row.status !== "running" && row.status !== "ready") {
      return NextResponse.json(
        { error: `sandbox_not_live:${row.status}` },
        { status: 409 },
      );
    }
    if (row.tier !== "ec2" && row.tier !== "hosted") {
      return NextResponse.json({ error: "sandbox_tier_not_configured" }, { status: 503 });
    }
    if (row.tier !== kind) {
      return NextResponse.json({ error: "sandbox_tier_mismatch" }, { status: 409 });
    }
    const orchestrator = resolveOrchestratorByTier(row.tier);
    if (!orchestrator.url || !orchestrator.apiKey) {
      return NextResponse.json(
        { error: "orchestrator_not_configured" },
        { status: 503 },
      );
    }
    const sandboxId = row.sandbox_id ?? "";
    if (!sandboxId) {
      return NextResponse.json(
        { error: "sandbox_id_missing" },
        { status: 503 },
      );
    }
    let resp: Response;
    try {
      resp = await fetch(
        `${orchestrator.url.replace(/\/$/, "")}/sandboxes/${sandboxId}/agent-binding`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": orchestrator.apiKey,
          },
          body: "{}",
        },
      );
    } catch (err) {
      return NextResponse.json(
        { error: `orchestrator_unreachable: ${(err as Error).message}` },
        { status: 502 },
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        {
          error: `orchestrator_error: HTTP ${resp.status} ${text.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }
    const data: unknown = await resp.json().catch(() => null);
    if (!isJsonObject(data) || data.sandbox_id !== sandboxId ||
        typeof data.base_url !== "string" || !data.base_url ||
        typeof data.access_token !== "string" || !data.access_token ||
        typeof data.root_path !== "string" || !data.root_path) {
      return NextResponse.json({ error: "invalid_orchestrator_binding" }, { status: 502 });
    }
    const payload: SandboxBindingPayload = {
      sandbox_id: data.sandbox_id,
      base_url: data.base_url,
      access_token: data.access_token,
      root_path: data.root_path,
      target_kind: "sandbox",
    };
    return NextResponse.json(payload);
  }

  if (kind === "local-pc") {
    const { data: row, error } = await supabase
      .from("app_instances")
      .select(
        "id, instance_id, tunnel_active, tunnel_url, last_seen, is_active, home_dir",
      )
      .is("deleted_at", null)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "device_not_found" }, { status: 404 });
    }
    const lastSeenMs = row.last_seen ? Date.parse(row.last_seen) : 0;
    const stale = !lastSeenMs || Date.now() - lastSeenMs > 10 * 60 * 1000;
    if (!row.tunnel_active || stale || !row.tunnel_url) {
      return NextResponse.json({ error: "device_offline" }, { status: 410 });
    }
    const accessToken = session?.access_token ?? "";
    if (!accessToken) {
      return NextResponse.json({ error: "no_session_token" }, { status: 401 });
    }
    if (typeof row.home_dir !== "string" || !row.home_dir.trim()) {
      return NextResponse.json({ error: "device_home_not_reported" }, { status: 503 });
    }
    const aidreamBase =
      process.env.AIDREAM_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_AIDREAM_URL ||
      "https://server.app.matrxserver.com";
    const baseUrl = `${aidreamBase.replace(/\/$/, "")}/api/local-proxy/${row.id}`;
    const payload: SandboxBindingPayload = {
      sandbox_id: row.instance_id ?? String(row.id),
      base_url: baseUrl,
      access_token: accessToken,
      root_path: row.home_dir.trim(),
      target_kind: "local_machine",
    };
    return NextResponse.json(payload);
  }

  return NextResponse.json({ error: `unknown_kind: ${kind}` }, { status: 400 });
}
