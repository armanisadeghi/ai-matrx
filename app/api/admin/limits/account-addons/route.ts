// GET /api/admin/limits/account-addons — the add-on register for Limits & Knobs.
//
// WHY THIS ROUTE EXISTS AT ALL (DD-137b staff door, 2026-09-22).
// `billing.account_addon` resolves `private`, and §3.5's promise is that private
// means no standing read for anyone, our own staff included. Its only client read
// was `platform_admin_all` — a standing platform-admin lane — and
// `features/admin/limits/service.ts` read the table straight from the browser on
// the back of it. Closing the lane without moving the read would have left the
// Limits screen showing an empty add-on list with no explanation, which is the
// "a screen never lies" failure, so the read moves FIRST and the policy closes
// after.
//
// This is the same door `features/admin/shared-knowledge/server.ts` already uses
// and explains in its own header: the admin client for the reads that client-side
// RLS deliberately hides from an admin's own session, behind an explicit
// TS-level gate, with every mutation left where it was.
//
// WRITES DO NOT COME THROUGH HERE. Granting an add-on stays on
// `billing.addon_grant`, the super-admin SECURITY DEFINER function — it is money.
// This route reads and nothing else.

import { NextResponse } from "next/server";
import { readAllRows } from "@ai-matrx/data/db";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireAdmin } from "@/utils/auth/adminUtils";
import type { AccountAddon } from "@/features/admin/limits/types";

/** The column list the panel renders, unchanged from the old client-direct read. */
const COLUMNS =
  "id, organization_id, capability, period, limit_value, source, note, granted_by, effective_from, expires_at, created_at";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Unauthorized") ? 401 : 403 },
    );
  }

  const admin = createAdminClient();
  try {
    const addons = await readAllRows<AccountAddon>(
      ({ from, to }) =>
        admin
          .schema("billing")
          .from("account_addon")
          .select(COLUMNS, { count: "exact" })
          .order("effective_from", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<AccountAddon[]>(),
      { label: "billing.account_addon (limits admin)" },
    );
    return NextResponse.json({ addons });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
