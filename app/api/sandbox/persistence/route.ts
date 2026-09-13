import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { readPersistenceTier } from "@/lib/sandbox/persistence-read";
import {
  orchestratorJsonHeaders,
  resolveOrchestratorByTier,
} from "@/lib/sandbox/orchestrator-routing";
import type { SandboxTier, UserPersistenceResponse } from "@/types/sandbox";

/**
 * GET /api/sandbox/persistence
 *
 * Aggregates per-user persistent-storage info across all tiers. Talks to each
 * orchestrator's `GET /users/{user_id}/persistence` endpoint shipped by the
 * Python team in Phase 1+2+3 of the persistence plan. The hosted tier returns
 * a Docker-volume record; size can remain unknown when Docker does not expose
 * UsageData. Every tier outcome is retained so unavailable never means empty.
 *
 * The `partial` flag is set if any orchestrator was unreachable or returned
 * less data than expected, so the UI can render "—" rather than "0 B" without
 * having to inspect every individual tier entry.
 *
 * DELETE /api/sandbox/persistence
 *
 * Forwards only `?tier=hosted` to `DELETE /users/{user_id}/volume`. EC2 home
 * management is per-sandbox and is not a user-level delete operation here.
 * The orchestrator refuses while any sandbox remains attached to the volume;
 * its 409 is surfaced without guessing from active-count telemetry.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tierFilter = url.searchParams.get("tier");
  const tiers: SandboxTier[] =
    tierFilter === "ec2" || tierFilter === "hosted"
      ? [tierFilter]
      : ["hosted", "ec2"];

  const tierInfos = await Promise.all(
    tiers.map((tier) => readPersistenceTier(tier, user.id)),
  );
  const total = tierInfos.reduce(
    (sum, info) =>
      sum +
      (typeof info.current_size_bytes === "number"
        ? info.current_size_bytes
        : 0),
    0,
  );
  const partial = tierInfos.some(
    (info) =>
      info.status !== "available" ||
      typeof info.current_size_bytes !== "number",
  );

  const payload: UserPersistenceResponse = {
    user_id: user.id,
    total_size_bytes: total,
    partial,
    tiers: tierInfos,
  };
  return NextResponse.json(payload);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tierFilter = url.searchParams.get("tier");
  if (tierFilter !== "hosted") {
    return NextResponse.json(
      { ok: false, error: "Only hosted-tier storage can be wiped here." },
      { status: 400 },
    );
  }
  const tiers: Array<"hosted"> = ["hosted"];

  const results: Array<{
    tier: "ec2" | "hosted";
    ok: boolean;
    status: number;
    error?: string;
  }> = [];

  for (const tier of tiers) {
    const target = resolveOrchestratorByTier(tier);
    if (!target.apiKey) {
      results.push({
        tier,
        ok: false,
        status: 0,
        error: "tier not configured",
      });
      continue;
    }
    try {
      const resp = await fetch(
        `${target.url}/users/${encodeURIComponent(user.id)}/volume`,
        {
          method: "DELETE",
          headers: orchestratorJsonHeaders(target),
        },
      );
      if (resp.ok || resp.status === 204 || resp.status === 404) {
        // 404 = already gone; treat as success.
        results.push({ tier, ok: true, status: resp.status });
        continue;
      }
      const text = await resp.text().catch(() => resp.statusText);
      results.push({ tier, ok: false, status: resp.status, error: text });
    } catch (err) {
      console.error(`[sandbox/persistence] tier=${tier} delete failed:`, err);
      results.push({
        tier,
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    { ok: allOk, results },
    { status: allOk ? 200 : 409 },
  );
}
