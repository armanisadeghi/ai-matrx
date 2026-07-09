/**
 * CMS Validation Approvals Queue — F3 escape hatch (master plan §5 C3, §8 F3).
 *
 * P3 (`packages/matrx-content-guard`) owns the exception shape
 * (`matrx_content_guard.models.ContentException` / `Violation`) and the matching
 * semantics. P1 owns the store — a table on the CMS project (viyklljfdhtidwecakwx)
 * P1 has not created yet as of 2026-07-09. This route is P5's review/approve UI
 * built against that day-1 shape: it expects a `client_content_exceptions` table
 * (pending/approved/rejected rows carrying the `Violation` that triggered the
 * request plus the `ContentException` fields that would suppress it) and degrades
 * gracefully — returning `available: false` instead of a hard error — until that
 * table exists. Swap the table name here if P1 lands a different one.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { getCmsClient } from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";

const EXCEPTIONS_TABLE = "client_content_exceptions";
/** Postgres: undefined_table */
const UNDEFINED_TABLE = "42P01";

export async function POST(request: NextRequest) {
  try {
    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireSuperAdmin();

    const body = await request.json();
    const { action, ...params } = body;
    const db = getCmsClient();

    switch (action) {
      case "list": {
        const { status = "pending", siteId } = params;

        let query = db
          .from(EXCEPTIONS_TABLE)
          .select("*")
          .order("created_at", { ascending: false });
        if (status) query = query.eq("status", status);
        if (siteId) query = query.eq("scope_site_id", siteId);

        const { data, error } = await query;

        if (error) {
          if (error.code === UNDEFINED_TABLE) {
            return NextResponse.json({
              violations: [],
              available: false,
              message:
                "Validation exception store not yet available — pending P1's client_content_exceptions table (C3 contract, matrx-content-guard).",
            });
          }
          console.error("[cms/approvals] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ violations: data ?? [], available: true });
      }

      case "approve":
      case "reject": {
        const { exceptionId, note } = params;
        if (!exceptionId) {
          return NextResponse.json(
            { error: "exceptionId is required" },
            { status: 400 },
          );
        }

        const nextStatus = action === "approve" ? "approved" : "rejected";
        const { data, error } = await db
          .from(EXCEPTIONS_TABLE)
          .update({
            status: nextStatus,
            note: note ?? null,
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", exceptionId)
          .select()
          .single();

        if (error) {
          if (error.code === UNDEFINED_TABLE) {
            return NextResponse.json(
              {
                error:
                  "Validation exception store not yet available — pending P1's client_content_exceptions table.",
                available: false,
              },
              { status: 503 },
            );
          }
          console.error(`[cms/approvals] ${action} error:`, error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logCmsActivity(db, {
          siteId: data.scope_site_id ?? null,
          activityType: `validation.exception_${nextStatus}`,
          entityType: "exception",
          entityId: exceptionId,
          description: `${nextStatus === "approved" ? "Approved" : "Rejected"} exception for rule "${data.rule_id}"`,
          userId: user.id,
          userEmail: user.email,
          changes: { ruleId: data.rule_id, note },
        });

        return NextResponse.json({ success: true, exception: data });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/approvals] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Forbidden") ? 403 : message.startsWith("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
