// app/api/admin/canonicalization/route.ts
//
// Super-admin API for the Canonicalization Toolkit (docs/canonicalization_worklog.md §5b).
//   GET  ?dataset=overview|summary|findings|broken-functions|function-deps|
//                 m2m-candidates|unregistered-candidates|stale-registry|refresh-log
//   POST { action: "refresh" } — runs `select audit.refresh();` (rebuilds every
//         audit.* snapshot: the full gate over all registered tables +
//         plpgsql_check over every function). Read/refresh only — this route
//         never applies migrations or writes canonical tables.

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  fetchDatasetRows,
  fetchOverview,
  runAuditRefresh,
} from "@/features/administration/canonicalization/service/canonicalizationService";
import {
  CANONICALIZATION_DATASETS,
  type CanonicalizationDataset,
} from "@/features/administration/canonicalization/types";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const dataset = (request.nextUrl.searchParams.get("dataset") ??
    "overview") as CanonicalizationDataset;

  if (!CANONICALIZATION_DATASETS.includes(dataset)) {
    return NextResponse.json({ error: `Unknown dataset: ${dataset}` }, { status: 400 });
  }

  try {
    if (dataset === "overview") {
      const overview = await fetchOverview();
      return NextResponse.json({ overview });
    }
    const rows = await fetchDatasetRows(dataset);
    return NextResponse.json({ rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body — fall through to the "unsupported action" response below
  }

  if (body.action !== "refresh") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    const start = Date.now();
    const result = await runAuditRefresh();
    return NextResponse.json({ ...result, durationMs: Date.now() - start });
  } catch (e) {
    return errorResponse(e);
  }
}
