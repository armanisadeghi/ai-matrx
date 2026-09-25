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
  runTableImpactPage,
} from "@/features/administration/canonicalization/service/canonicalizationService";
import { isJsonObject } from "@/types/json";

export const dynamic = "force-dynamic";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (
    !isJsonObject(body) ||
    typeof body.schema !== "string" ||
    typeof body.table !== "string"
  ) {
    return NextResponse.json(
      { error: "schema and table are required" },
      { status: 400 },
    );
  }

  const offset = body.offset === undefined ? 0 : body.offset;
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    return NextResponse.json(
      { error: "offset must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    const page = await runTableImpactPage(body.schema, body.table, offset);
    return NextResponse.json(page);
  } catch (e) {
    return errorResponse(e);
  }
}
