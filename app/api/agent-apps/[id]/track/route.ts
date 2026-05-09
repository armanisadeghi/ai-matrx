import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";

/**
 * POST /api/agent-apps/[id]/track
 *
 * Non-blocking execution tracking for the agent-app public renderer.
 *
 * The renderer fires fire-and-forget POSTs at four lifecycle moments:
 *   - `visit`        — page mounted (one row per page open, kind='visit')
 *   - `run_start`    — user clicked Run; INSERT row with kind='run' and
 *                      success=NULL. Client supplies a uuid `taskId` that
 *                      it will reuse for the matching completion event.
 *   - `run_complete` — stream finished without error; UPDATE row by
 *                      `taskId`, set success=true, executionTimeMs.
 *   - `run_error`    — stream errored or client threw; UPDATE row by
 *                      `taskId`, set success=false + error fields.
 *
 * Uses the admin client (RLS-bypass) so the in-shell `/agent-apps/[id]/run`
 * sub-route can track runs against draft/private apps. The legacy
 * `aga_executions_insert_anon` RLS policy required `status='published'`,
 * which would block tracking from the management shell. Auth is still
 * captured: if the request carries a session cookie we record `user_id`,
 * otherwise we fall back to the `X-Fingerprint-ID` header.
 *
 * Constraints:
 *   - Must NOT delay any user-facing request. The renderer never awaits
 *     this endpoint; failures here MUST be silent.
 *   - Returns 202 on success; payload is intentionally minimal so
 *     `keepalive`/sendBeacon usage stays cheap.
 */

type TrackEvent = "visit" | "run_start" | "run_complete" | "run_error";

interface TrackPayload {
  event: TrackEvent;
  taskId?: string;
  variables?: Record<string, unknown>;
  errorType?: string;
  errorMessage?: string;
  executionTimeMs?: number;
  metadata?: Record<string, unknown>;
}

function getClientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: appId } = await context.params;

    if (!isUuid(appId)) {
      return NextResponse.json({ error: "Invalid app id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as TrackPayload | null;
    if (!body || !body.event) {
      return NextResponse.json({ error: "Missing event" }, { status: 400 });
    }

    const validEvents: TrackEvent[] = [
      "visit",
      "run_start",
      "run_complete",
      "run_error",
    ];
    if (!validEvents.includes(body.event)) {
      return NextResponse.json(
        { error: `Invalid event: ${body.event}` },
        { status: 400 },
      );
    }

    // Resolve identity: session cookie → user_id; otherwise fingerprint
    // header. Both branches end up using the admin client to write so RLS
    // policies don't gate tracking against draft apps.
    const supabaseSsr = (await createClient()) as unknown as {
      auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
    };
    const {
      data: { user },
    } = await supabaseSsr.auth.getUser();

    const fingerprint =
      request.headers.get("x-fingerprint-id") ||
      request.headers.get("X-Fingerprint-ID") ||
      null;

    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent");
    const referer = request.headers.get("referer");

    const admin = createAdminClient();

    // ── Run lifecycle: completion / error update an existing row ─────────
    if (body.event === "run_complete" || body.event === "run_error") {
      if (!isUuid(body.taskId)) {
        return NextResponse.json(
          { error: "taskId required for run_complete/run_error" },
          { status: 400 },
        );
      }

      const patch: Record<string, unknown> = {
        success: body.event === "run_complete",
      };
      if (typeof body.executionTimeMs === "number") {
        patch.execution_time_ms = Math.max(0, Math.floor(body.executionTimeMs));
      }
      if (body.event === "run_error") {
        patch.error_type = body.errorType ?? "stream_error";
        patch.error_message = body.errorMessage ?? null;
      }
      if (body.metadata) {
        patch.metadata = body.metadata;
      }

      const { error } = await admin
        .from("aga_executions")
        .update(patch)
        .eq("task_id", body.taskId)
        .eq("app_id", appId);

      if (error) {
        console.error("[track] update failed", { event: body.event, error });
        return NextResponse.json(
          { error: "Update failed", details: error.message },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true }, { status: 202 });
    }

    // ── visit / run_start: INSERT new row ─────────────────────────────────
    const taskId =
      body.event === "run_start" && isUuid(body.taskId)
        ? body.taskId
        : crypto.randomUUID();

    const insertPayload = {
      app_id: appId,
      kind: body.event === "visit" ? "visit" : "run",
      task_id: taskId,
      user_id: user?.id ?? null,
      fingerprint: user ? null : fingerprint,
      ip_address: ip ?? null,
      user_agent: userAgent,
      referer,
      variables_provided:
        body.event === "run_start" ? (body.variables ?? {}) : {},
      variables_used:
        body.event === "run_start" ? (body.variables ?? {}) : {},
      success: null,
      metadata: body.metadata ?? {},
    } as unknown as Record<string, unknown>;

    const { error } = await admin.from("aga_executions").insert(insertPayload);

    if (error) {
      // Rate-limit trigger may raise check_violation for legitimate
      // run_start INSERTs once a guest exhausts their window. That's the
      // existing aga_apps rate-limiter speaking — we propagate the status
      // but the client never observes it (fire-and-forget).
      const isRateLimit =
        error.code === "23514" ||
        /agent_app_rate_limit_exceeded/.test(error.message ?? "");
      console.error("[track] insert failed", { event: body.event, error });
      return NextResponse.json(
        { error: "Insert failed", details: error.message },
        { status: isRateLimit ? 429 : 500 },
      );
    }

    return NextResponse.json({ ok: true, taskId }, { status: 202 });
  } catch (err) {
    console.error("[track] unexpected", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
