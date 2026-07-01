// app/api/admin/canonicalization/verify/route.ts
//
// Per-table gate from the §5d flip loop:
//   iam.verify_canonical / verify_canonical_ok — the full checklist + floor gate
//   iam.canonical_certify / canonical_certify_ok — blocking rows (FAIL/WARN +
//     currently-broken dependent fns); empty = perfect, the loop's "done" gate.
// Read-only — never calls iam.apply_rls or platform.retrofit_entity.

import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  lookupEntityToken,
  runVerifyCanonical,
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

/** GET ?schema=&table= — autofills the registered token from platform.entity_types. */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const schema = request.nextUrl.searchParams.get("schema");
  const table = request.nextUrl.searchParams.get("table");
  if (!schema || !table) {
    return NextResponse.json({ error: "schema and table are required" }, { status: 400 });
  }

  try {
    const token = await lookupEntityToken(schema, table);
    return NextResponse.json({ token });
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

  let body: { schema?: string; table?: string; token?: string; variant?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.schema || !body.table || !body.token) {
    return NextResponse.json({ error: "schema, table, and token are required" }, { status: 400 });
  }

  try {
    const result = await runVerifyCanonical(body.schema, body.table, body.token, body.variant);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
