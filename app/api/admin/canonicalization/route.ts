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

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function jsonNoCache(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...NO_CACHE_HEADERS, ...init?.headers },
  });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return jsonNoCache({ error: message }, { status });
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
    return jsonNoCache(
      { error: `Unknown dataset: ${dataset}` },
      { status: 400 },
    );
  }

  try {
    if (dataset === "overview") {
      const overview = await fetchOverview();
      return jsonNoCache({ overview });
    }
    const rows = await fetchDatasetRows(dataset);
    return jsonNoCache({ rows });
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
    return jsonNoCache({ error: "Unsupported action" }, { status: 400 });
  }

  try {
    const start = Date.now();
    const result = await runAuditRefresh();
    return jsonNoCache({ ...result, durationMs: Date.now() - start });
  } catch (e) {
    return errorResponse(e);
  }
}
