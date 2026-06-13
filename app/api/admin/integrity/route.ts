// app/api/admin/integrity/route.ts
//
// Super-admin data-integrity API.
//   GET  — list the registered checks (metadata only).
//   POST — run checks and return a report. Body (all optional):
//            { checkIds?: string[], includeProbe?: boolean }
//          Read-only: integrity checks never mutate data.
//
// SQL runs through the admin client (RLS-bypassed, cross-user). The opt-in byte
// probe uses the caller's session token, so it only covers files that token can
// access (no cross-user service token exists yet — see lib/integrity/checks.ts).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { listChecks, runIntegrityChecks } from "@/lib/integrity/runner";
import {
  createAdminSqlRunner,
  createDownloadProbe,
} from "@/lib/integrity/server";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }
  const checks = listChecks().map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    severity: c.severity,
    kind: c.kind,
    remediation: c.remediation ?? null,
  }));
  return NextResponse.json({ checks });
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  let body: { checkIds?: string[]; includeProbe?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // empty body → run all (non-probe) checks
  }

  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;

    const report = await runIntegrityChecks(
      {
        sql: createAdminSqlRunner(),
        probe: createDownloadProbe(token),
      },
      { checkIds: body.checkIds, includeProbe: body.includeProbe },
    );
    return NextResponse.json({ report });
  } catch (e) {
    return errorResponse(e);
  }
}
