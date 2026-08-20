import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type { Database } from "@/types/database.types";
import type {
  AcquisitionJourney,
  AcquisitionJourneyEvent,
} from "@/features/admin/users/types";

const LIMIT = 500;
type ApiRow = Database["public"]["Tables"]["api_request_log"]["Row"];

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

function featureFromPath(path: string): string {
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "api") parts.shift();
  return parts.slice(0, 2).join(" / ") || "root";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rowId: string }> },
) {
  try {
    await requireSuperAdmin();
    const { rowId } = await params;
    const decoded = decodeURIComponent(rowId);
    const isVisitor = decoded.startsWith("visitor:");
    const visitorId = isVisitor ? decoded.slice("visitor:".length) : null;
    const userId = isVisitor ? null : decoded;
    const from = request.nextUrl.searchParams.get("from");
    const admin = createAdminClient();

    let fingerprint: string | null = null;
    if (visitorId) {
      const { data, error } = await admin
        .from("guest_executions")
        .select("fingerprint")
        .eq("id", visitorId)
        .maybeSingle();
      if (error) throw error;
      fingerprint = data?.fingerprint ?? null;
    } else if (userId) {
      const { data, error } = await admin
        .from("guest_executions")
        .select("fingerprint")
        .or(
          `auth_user_id.eq.${userId},converted_to_user_id.eq.${userId}`,
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      fingerprint = data?.fingerprint ?? null;
    }

    const apiQueries = [];
    if (userId) {
      let query = admin
        .from("api_request_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (from) query = query.gte("created_at", from);
      apiQueries.push(query);
    }
    if (fingerprint) {
      let query = admin
        .from("api_request_log")
        .select("*")
        .eq("fingerprint_id", fingerprint)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (from) query = query.gte("created_at", from);
      apiQueries.push(query);
    }

    const apiResults = await Promise.all(apiQueries);
    const apiById = new Map<string, ApiRow>();
    for (const result of apiResults) {
      if (result.error) throw result.error;
      for (const row of result.data) apiById.set(row.id, row);
    }
    const apiRows = [...apiById.values()];
    const requestIds = [...new Set(apiRows.map((row) => row.request_id))];

    let errorsQuery = admin
      .from("system_error")
      .select("id,occurred_at,kind,error_text,error_type,request_id,route,source_app,resolved_at")
      .order("occurred_at", { ascending: false })
      .limit(LIMIT);
    if (userId) errorsQuery = errorsQuery.eq("user_id", userId);
    else if (requestIds.length) errorsQuery = errorsQuery.in("request_id", requestIds);
    else errorsQuery = errorsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    if (from) errorsQuery = errorsQuery.gte("occurred_at", from);

    let logsQuery = admin
      .from("app_log")
      .select("id,ts,level,message,request_id,route,feature,exc_type")
      .gte("level_no", 30)
      .order("ts", { ascending: false })
      .limit(LIMIT);
    if (userId) logsQuery = logsQuery.eq("user_id", userId);
    else if (requestIds.length) logsQuery = logsQuery.in("request_id", requestIds);
    else logsQuery = logsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    if (from) logsQuery = logsQuery.gte("ts", from);

    let runtimeRequestsQuery = admin
      .schema("runtime")
      .from("global_request")
      .select("id,created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (userId) runtimeRequestsQuery = runtimeRequestsQuery.eq("created_by", userId);
    else runtimeRequestsQuery = runtimeRequestsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    if (from) runtimeRequestsQuery = runtimeRequestsQuery.gte("created_at", from);

    const [errorsResult, logsResult, runtimeRequestsResult] = await Promise.all([
      errorsQuery,
      logsQuery,
      runtimeRequestsQuery,
    ]);
    if (errorsResult.error) throw errorsResult.error;
    if (logsResult.error) throw logsResult.error;
    if (runtimeRequestsResult.error) throw runtimeRequestsResult.error;

    const runtimeIds = runtimeRequestsResult.data.map((row) => row.id);
    const runtimeExecutionsResult = runtimeIds.length
      ? await admin
          .schema("runtime")
          .from("global_execution")
          .select("id,request_id,type,status,cost,created_at,ended_at,error")
          .in("request_id", runtimeIds)
          .order("created_at", { ascending: false })
          .limit(LIMIT)
      : { data: [], error: null };
    if (runtimeExecutionsResult.error) throw runtimeExecutionsResult.error;

    const featureMap = new Map<string, { requests: number; failures: number }>();
    for (const row of apiRows) {
      const feature = featureFromPath(row.path);
      const current = featureMap.get(feature) ?? { requests: 0, failures: 0 };
      current.requests += 1;
      if ((row.status_code ?? 0) >= 400) current.failures += 1;
      featureMap.set(feature, current);
    }

    const events: AcquisitionJourneyEvent[] = [
      ...apiRows.map((row) => ({
        id: `api:${row.id}`,
        occurred_at: row.created_at,
        kind: "api" as const,
        title: `${row.method} ${row.path}`,
        detail: row.error,
        status: row.status_code === null ? null : String(row.status_code),
        request_id: row.request_id,
        route: row.path,
        cost: null,
        is_problem: (row.status_code ?? 0) >= 400,
      })),
      ...runtimeExecutionsResult.data.map((row) => ({
        id: `runtime:${row.id}`,
        occurred_at: row.created_at,
        kind: "runtime" as const,
        title: row.type,
        detail: row.error ? JSON.stringify(row.error) : null,
        status: row.status,
        request_id: row.request_id,
        route: null,
        cost: row.cost,
        is_problem: row.status === "failed" || row.status === "cancelled",
      })),
      ...errorsResult.data.map((row) => ({
        id: `error:${row.id}`,
        occurred_at: row.occurred_at,
        kind: "error" as const,
        title: row.kind,
        detail: row.error_text,
        status: row.resolved_at ? "resolved" : "unresolved",
        request_id: row.request_id,
        route: row.route,
        cost: null,
        is_problem: true,
      })),
      ...logsResult.data.map((row) => ({
        id: `log:${row.id}`,
        occurred_at: row.ts,
        kind: "server_log" as const,
        title: `${row.level}: ${row.feature}`,
        detail: row.message,
        status: row.exc_type,
        request_id: row.request_id,
        route: row.route,
        cost: null,
        is_problem: true,
      })),
    ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

    const failedRequests = apiRows.filter((row) => (row.status_code ?? 0) >= 400).length;
    const runtimeCost = runtimeExecutionsResult.data.reduce((sum, row) => sum + row.cost, 0);
    const hasMeaningfulUse = apiRows.some((row) => (row.status_code ?? 500) < 400);
    const verdict: AcquisitionJourney["verdict"] =
      apiRows.length === 0 && runtimeIds.length === 0
        ? "no_activity"
        : (errorsResult.data.length > 0 || failedRequests > 0) && !hasMeaningfulUse
          ? "blocked"
          : runtimeExecutionsResult.data.length > 0
            ? "engaged"
            : "exploring";

    const journey: AcquisitionJourney = {
      verdict,
      api_requests: apiRows.length,
      successful_requests: apiRows.length - failedRequests,
      failed_requests: failedRequests,
      runtime_requests: runtimeIds.length,
      runtime_executions: runtimeExecutionsResult.data.length,
      runtime_cost: runtimeCost,
      errors: errorsResult.data.length + logsResult.data.length,
      last_activity: events[0]?.occurred_at ?? null,
      feature_usage: [...featureMap.entries()]
        .map(([feature, counts]) => ({ feature, ...counts }))
        .sort((a, b) => b.requests - a.requests),
      events,
    };
    return NextResponse.json({ journey });
  } catch (error) {
    return errorResponse(error);
  }
}
