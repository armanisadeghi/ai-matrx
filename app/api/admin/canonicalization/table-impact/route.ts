// app/api/admin/canonicalization/table-impact/route.ts
//
// Preflight blast-radius check — `audit.table_impact(schema, table)` — every
// function touching a table, whether its dependency edge is precise or
// text-qualified, whether it's currently broken, and the exact referenced
// columns. Run before any rename/drop (docs/canonicalization_worklog.md §5b).

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  listKnownTables,
  runTableImpact,
} from "@/features/administration/canonicalization/service/canonicalizationService";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

/** GET returns the known (schema, table) pairs from `audit.summary` for autocomplete. */
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  try {
    const tables = await listKnownTables();
    return NextResponse.json({ tables });
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

  let body: { schema?: string; table?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.schema || !body.table) {
    return NextResponse.json({ error: "schema and table are required" }, { status: 400 });
  }

  try {
    const rows = await runTableImpact(body.schema, body.table);
    return NextResponse.json({ rows });
  } catch (e) {
    return errorResponse(e);
  }
}
